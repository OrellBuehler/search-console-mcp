# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A STDIO MCP server that exposes the **official Google Search Console API** (webmasters v3 +
searchconsole v1) as tools for AI agents, centered on **search performance** (clicks, impressions,
CTR, position by query/page/country/device/date), **index health** (URL inspection) and **sitemap
and property management**. Published to npm as `@orellbuehler/search-console-mcp` and run via `npx`;
the compiled `dist/index.js` is the `bin` entry. See `README.md` for the tool catalog and env-var
reference.

Note the Indexing API (requesting URL (re)indexing) is a **different, unrelated** API restricted to
job postings and livestreams — it is not used here. Neither is Google Analytics.

## Commands

```bash
npm run build         # tsc -p tsconfig.build.json -> dist/
npm test              # vitest run (all tests)
npm run test:watch    # vitest watch
npm run lint          # eslint src
npm run typecheck     # tsc --noEmit
npm run format        # prettier --write .
npm run format:check  # prettier --check . (what CI runs)
```

Run a single test file or pattern:

```bash
npx vitest run src/__tests__/analytics.test.ts
npx vitest run -t "top_queries"
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, and `test` + `build` on
Node 20 and 22 — all must pass. Run them locally before committing.

## Architecture

Request flow: `index.ts` reads config, builds the server via `server.ts:createServer(client,
inspectionClient, siteUrl, allowDestructive)`, and connects it over stdio. Each tool calls one of
the two REST clients.

- **`src/index.ts`** — entry point. Stdio transport only (single-account).
- **`src/config.ts`** — reads env at import time and **exits the process** if neither
  `GOOGLE_SERVICE_ACCOUNT_KEY` nor `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` is set. Exports `config`
  (including `siteUrl` from `GOOGLE_SEARCH_CONSOLE_SITE_URL` and `allowDestructive` from
  `GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE`), `client` (webmasters v3: analytics, sitemaps, sites)
  and `inspectionClient` (searchconsole v1: URL inspection).
- **`src/gsc/auth.ts`** — `createTokenProvider(auth)`: signs an RS256 service-account JWT with
  `jose` and exchanges it at `https://oauth2.googleapis.com/token` for an OAuth access token, cached
  until expiry with a 60 s buffer. Single scope (`webmasters`); one provider serves both clients.
  The key JSON is loaded lazily on first use (inline or from a file path). No `googleapis` /
  `google-auth-library` dependency.
- **`src/gsc/client.ts`** — `GoogleSearchConsoleClient`, a thin `fetch` wrapper. One class, two
  instances built from `WEBMASTERS_BASE_URL` and `SEARCHCONSOLE_BASE_URL`. `get`/`post`/`put`/`del`;
  `post` and `put` take an optional body (`submit_sitemap` and `add_site` are body-less PUTs) and
  tolerate empty response bodies. Throws on non-2xx with the response body in the message.
- **`src/gsc/format.ts`** — `ok`/`err` (MCP content envelopes; `ok` passes strings through
  unquoted), `resolveSite` (per-tool `site_url` overriding `GOOGLE_SEARCH_CONSOLE_SITE_URL`,
  throwing a helpful error if neither is set) and `defaultDateRange` (28 days ending 3 days ago,
  UTC — Search Console data lags ~2–3 days).
- **`src/tools/*.ts`** — each exports a `register*Tools(server, client, defaultSiteUrl?)` function
  that `server.ts` calls: `analytics` (searchAnalytics/query + `top_queries`/`top_pages` wrappers),
  `sitemaps` and `sites` (both take a fourth `allowDestructive` argument) on the webmasters client,
  `inspection` on the searchconsole client.
- **`src/tools/shared.ts`** — Zod shapes reused across tool modules: `siteArg`, `startDateArg`,
  `endDateArg`, `countryArg`, `deviceArg`. Reuse these instead of redeclaring them.

## Conventions

- **ESM with Node16 module resolution: all relative imports must end in `.js`** (e.g.
  `import { ok } from "../gsc/format.js"`), even though the source is `.ts`.
- **Tool handler shape:** `server.tool(name, description, zodShape, async (args) => { try { return
ok(...); } catch (e) { return err(e); } })`. The third argument is a raw Zod shape object. Match this
  try/catch-`ok`/`err` style exactly.
- **Tool args are snake_case** and every field gets a `.describe(...)`. Descriptions are long and
  agent-facing: name the fields that come back, state defaults and limits, and cross-reference
  sibling tools ("For other dimensions use query_search_analytics").
- **Site-scoped tools take an optional `site_url`** resolved through `resolveSite`. Exceptions:
  `add_site` and `delete_site` require an explicit `site_url` — never add or delete the default
  property implicitly.
- **Always `encodeURIComponent` site URLs and sitemap feedpaths in request paths** — they contain
  `://` and would otherwise corrupt the URL.
- **Pass the API through, don't fabricate fields.** Surface whatever Google returns rather than
  hand-mapping into a fixed schema, so the server stays correct if fields are added or renamed.
- **Don't add comments, docstrings, or type annotations** unless they already exist in the file
  you're editing (per global preference).
- **Scope of writes:** sitemap submit/delete and site add/delete only. Do **not** add Indexing API
  calls, property verification, or user/permission management.
- **Destructive tools are opt-in.** `delete_sitemap` and `delete_site` are only registered when
  `allowDestructive` is true (`GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE`). Implemented as an early
  `if (!allowDestructive) return;` in the register function, with the gated tools after it, so the
  gating is one obvious line rather than a per-tool condition. Any new delete or irreversible write
  goes below that line.
- **Secrets:** the repo is public. Never log the service account key or access tokens; only read
  them from env. Tests use a locally generated throwaway RSA key.

## Tests

Tests live in `src/__tests__/*.test.ts`. Tool tests pass a fake `{ tool: (name, desc, schema,
handler) => ... }` server to the `register*Tools` function to capture handlers, construct a real
`GoogleSearchConsoleClient` with a fake token provider (`async () => "tok"`), then stub global
`fetch` and assert the exact request URL (path + `searchParams`) and request bodies — including the
percent-encoding of site URLs and feedpaths, which is the part most likely to regress.
`analytics.test.ts` uses fake timers to pin `defaultDateRange` and asserts the exact JSON body sent
to `searchAnalytics/query` (filter wrapping into `dimensionFilterGroups`, rowLimit defaulting,
omitted optionals staying absent). `client.test.ts` covers URL building, body-less PUTs, empty
bodies and error handling; `auth.test.ts` signs with a generated RSA key and asserts the JWT
header/claims, the `webmasters` scope and token caching; `config.ts` reads env at import time and
exits if it's missing, so `config.test.ts` `vi.resetModules()` + `vi.stubEnv(...)` then dynamically
`import()`s it.

Gated modules (`sites`, `sitemaps`) take `allowDestructive` as an argument of the test `collect()`
helper and assert the **exact list of registered tool names** when it is false, so a new destructive
tool added above the gate fails the test.
