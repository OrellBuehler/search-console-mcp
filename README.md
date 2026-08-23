# search-console-mcp

[![npm](https://img.shields.io/npm/v/@orellbuehler/search-console-mcp.svg)](https://www.npmjs.com/package/@orellbuehler/search-console-mcp)
[![CI](https://github.com/OrellBuehler/search-console-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/OrellBuehler/search-console-mcp/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@orellbuehler/search-console-mcp.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

MCP server for **Google Search Console** that exposes the official
[Search Console API](https://developers.google.com/webmaster-tools) as tools for AI agents.

Its focus is **search performance and index health** — querying clicks, impressions, CTR and
position by query, page, country, device or date, checking whether a URL is indexed and why not,
and managing the sitemaps and properties of an account.

> **What it deliberately does not do:** no requesting (re)indexing of URLs — the separate
> [Indexing API](https://developers.google.com/search/apis/indexing-api/v3/quickstart) only supports
> job posting and livestream pages — no property ownership verification (an owner must add the
> service account to each property), and no Google Analytics data (that is the unrelated
> [Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)).

> **Deletes are opt-in.** `delete_sitemap` and `delete_site` are only registered when
> `GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE` is set — see [Configuration](#configuration).

## Install

```bash
claude mcp add search-console \
  -e GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json \
  -e GOOGLE_SEARCH_CONSOLE_SITE_URL=https://example.com/ \
  -- npx -y @orellbuehler/search-console-mcp
```

The `-e` flags must come **before** the `--` separator; anything after `--` is passed to the server
process instead of being read as configuration.

## Getting a service account key

1. In the [Google Cloud console](https://console.cloud.google.com), select or create a project and
   enable the **Google Search Console API**.
2. Go to **IAM & Admin → Service accounts → Create service account**. You can skip the optional
   "grant access" steps — Search Console permissions are granted separately, not via Cloud IAM
   roles.
3. Open the new service account, go to the **Keys** tab, and choose **Add key → Create new key →
   JSON**. The file downloads once and cannot be retrieved again.
4. In [Search Console](https://search.google.com/search-console), open the property, go to
   **Settings → Users and permissions → Add user**, and paste the service account's email address
   (`name@project-id.iam.gserviceaccount.com`). Grant:
   - **Restricted** or **Full** for the read tools (analytics, sitemaps, URL inspection)
   - **Full** for `submit_sitemap` and `delete_sitemap`
5. Repeat step 4 for every property the server should see — a service account cannot verify
   properties itself.
6. Point `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` at the downloaded JSON file.

Treat the JSON key like a password — it carries whatever permissions you granted, with no second
factor in front of it. Keep it outside the repository and consider `chmod 600`.

## Configuration

| Variable                                  | Required | Description                                                                |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`         | one of   | Path to the downloaded service account JSON key                            |
| `GOOGLE_SERVICE_ACCOUNT_KEY`              | one of   | The service account JSON key inline, as a raw JSON string                  |
| `GOOGLE_SEARCH_CONSOLE_SITE_URL`          | no       | Default property, so tools can omit `site_url`                             |
| `GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE` | no       | Set to `1`, `true` or `yes` to register `delete_sitemap` and `delete_site` |

A property is identified either as a **URL-prefix property** like `https://example.com/` (protocol
and trailing slash matter — `https://example.com/` and `http://example.com/` are different
properties) or as a **domain property** like `sc-domain:example.com`, which covers all subdomains
and protocols. Use whichever form the property was added to Search Console with; `list_sites` shows
the exact strings.

## Usage with Claude Code

```json
{
  "mcpServers": {
    "search-console": {
      "command": "npx",
      "args": ["-y", "@orellbuehler/search-console-mcp"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/service-account.json",
        "GOOGLE_SEARCH_CONSOLE_SITE_URL": "https://example.com/"
      }
    }
  }
}
```

## Example prompts

- "What are my top search queries this month?"
- "Which pages get the most clicks from Google, and how did that change vs the previous 28 days?"
- "Show queries containing 'pricing' where we rank below position 10 — quick-win candidates."
- "How much of our traffic is mobile vs desktop?"
- "Plot our daily clicks and impressions over the last three months."
- "Which countries do we get impressions from but almost no clicks?"
- "Is https://example.com/blog/launch indexed? If not, why?"
- "List our sitemaps and tell me if any have errors or warnings."
- "Resubmit the sitemap after yesterday's site restructure."
- "Which pages ranking for 'mcp server' compete with each other?"
- "Compare our Discover traffic to web search traffic this quarter."

## Tools

### Search analytics

| Tool                     | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `query_search_analytics` | Full-power performance query: any dimensions, filters, regex, search type, pagination up to 25k rows |
| `top_queries`            | Top search queries by clicks, optionally narrowed to a page, country or device                       |
| `top_pages`              | Top pages by clicks, optionally narrowed to a query substring, country or device                     |

### Sitemaps

| Tool             | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `list_sitemaps`  | List submitted sitemaps with status, errors, warnings and indexed URL counts |
| `get_sitemap`    | Get one sitemap's processing status and contents                             |
| `submit_sitemap` | Submit a new sitemap or resubmit an existing one for reprocessing            |
| `delete_sitemap` | Delete a sitemap from Search Console (opt-in via `..._ALLOW_DESTRUCTIVE`)    |

### Sites

| Tool          | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `list_sites`  | List all properties the service account can access, with permission levels     |
| `get_site`    | Get one property's permission level                                            |
| `add_site`    | Add an already-verified property to the account                                |
| `delete_site` | Remove a property from the account's view (opt-in via `..._ALLOW_DESTRUCTIVE`) |

### URL inspection

| Tool          | Description                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| `inspect_url` | Google index status of a URL: verdict, coverage, canonicals, last crawl, rich results, robots |

## Notes & caveats

- **Performance data lags ~2–3 days.** The convenience tools default their date range to end 3 days
  ago; `data_state: "all"` includes fresh but possibly incomplete data.
- **16-month retention.** Queries older than that return no rows.
- **Privacy filtering.** Rows for rare queries are withheld, so summing per-query rows undercounts
  the true totals; query without dimensions for exact totals.
- **25,000 rows per call.** Paginate with `start_row`; a response with fewer rows than `row_limit`
  is the last page.
- **URL inspection quota** is about 2,000 calls/day per property and 600/minute — inspect
  selectively, not in bulk.
- **The `hour` dimension** requires `data_state: "hourly_all"` and only covers the last ~10 days.
- **Your search data goes to the LLM.** Everything a tool returns becomes model context; don't
  connect properties whose data must not leave your environment.

## Development

```bash
npm install
npm run build         # tsc -p tsconfig.build.json -> dist/
npm test              # vitest run
npm run lint          # eslint src
npm run typecheck     # tsc --noEmit
npm run format        # prettier --write .
```

Smoke-test the built server against a real property:

```bash
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json \
GOOGLE_SEARCH_CONSOLE_SITE_URL=https://example.com/ \
npx @modelcontextprotocol/inspector node dist/index.js
```

## CI / Releasing

CI runs `format:check`, `lint`, `typecheck`, `test` and `build` on Node 20 and 22. Publishing happens
on GitHub release via npm trusted publishing (OIDC, no tokens):

```bash
npm version patch
git push --follow-tags
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

## License

MIT © Orell Bühler
