import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleSearchConsoleClient } from "../gsc/client.js";
import { ok, err, resolveSite } from "../gsc/format.js";
import { siteArg } from "./shared.js";

interface Site {
  siteUrl?: string;
  permissionLevel?: string;
}

export function registerSitesTools(
  server: McpServer,
  client: GoogleSearchConsoleClient,
  defaultSiteUrl?: string,
  allowDestructive = false,
) {
  server.tool(
    "list_sites",
    "List all Search Console properties the service account has access to. Each entry has siteUrl (either a URL-prefix property like 'https://example.com/' or a domain property like 'sc-domain:example.com') and permissionLevel (siteOwner, siteFullUser, siteRestrictedUser, or siteUnverifiedUser). Use the returned siteUrl values as site_url in the other tools. If a property is missing, its owner must add the service account's email under Settings > Users and permissions in Search Console.",
    {},
    async () => {
      try {
        const res = await client.get<{ siteEntry?: Site[] }>("/sites");
        return ok({ count: (res.siteEntry ?? []).length, ...res });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_site",
    "Get one Search Console property's info: siteUrl and the service account's permissionLevel (siteOwner, siteFullUser, siteRestrictedUser, or siteUnverifiedUser). Returns 404 if the service account has no access to the property.",
    {
      site_url: siteArg,
    },
    async ({ site_url }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const res = await client.get<Site>(`/sites/${encodeURIComponent(site)}`);
        return ok(res);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "add_site",
    "Add a property to the service account's Search Console account. The site must already be verified (by an owner adding the service account, or via prior verification) — this call does not verify ownership; an unverified site shows up with permissionLevel siteUnverifiedUser and its data is inaccessible. Returns no body on success; verify with get_site or list_sites.",
    {
      site_url: z
        .string()
        .describe(
          "Property to add: 'https://example.com/' (URL-prefix) or 'sc-domain:example.com' (domain)",
        ),
    },
    async ({ site_url }) => {
      try {
        await client.put(`/sites/${encodeURIComponent(site_url)}`);
        return ok({ siteUrl: site_url, added: true });
      } catch (e) {
        return err(e);
      }
    },
  );

  if (!allowDestructive) return;

  server.tool(
    "delete_site",
    "Remove a property from the service account's Search Console account. This only removes the account's access to the property; it does not delete any data in Google or affect other users of the property. Requires GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE.",
    {
      site_url: z
        .string()
        .describe(
          "Property to remove: 'https://example.com/' or 'sc-domain:example.com' (no default — must be explicit)",
        ),
    },
    async ({ site_url }) => {
      try {
        await client.del(`/sites/${encodeURIComponent(site_url)}`);
        return ok({ siteUrl: site_url, deleted: true });
      } catch (e) {
        return err(e);
      }
    },
  );
}
