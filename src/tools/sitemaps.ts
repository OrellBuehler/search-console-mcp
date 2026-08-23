import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleSearchConsoleClient } from "../gsc/client.js";
import { ok, err, resolveSite } from "../gsc/format.js";
import { siteArg } from "./shared.js";

interface Sitemap {
  path?: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
}

const feedpathArg = z.string().describe("Full sitemap URL, e.g. 'https://example.com/sitemap.xml'");

export function registerSitemapTools(
  server: McpServer,
  client: GoogleSearchConsoleClient,
  defaultSiteUrl?: string,
  allowDestructive = false,
) {
  server.tool(
    "list_sitemaps",
    "List sitemaps submitted for a property. Each sitemap has path, lastSubmitted, lastDownloaded, isPending, isSitemapsIndex, type, warnings and errors counts, and contents[] with per-type submitted/indexed URL counts. Pass sitemap_index to list the child sitemaps of a sitemap index file instead. Use submit_sitemap to add one and get_sitemap for a single sitemap's details.",
    {
      site_url: siteArg,
      sitemap_index: z
        .string()
        .optional()
        .describe(
          "URL of a sitemap index file, e.g. 'https://example.com/sitemap_index.xml'; lists the sitemaps it contains",
        ),
    },
    async ({ site_url, sitemap_index }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const res = await client.get<{ sitemap?: Sitemap[] }>(
          `/sites/${encodeURIComponent(site)}/sitemaps`,
          { sitemapIndex: sitemap_index },
        );
        return ok({ siteUrl: site, count: (res.sitemap ?? []).length, ...res });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get_sitemap",
    "Get one submitted sitemap's details: lastSubmitted, lastDownloaded, isPending (submitted but not yet processed), isSitemapsIndex, type, warnings and errors counts, and contents[] with submitted/indexed URL counts per content type. Get sitemap URLs from list_sitemaps.",
    {
      site_url: siteArg,
      feedpath: feedpathArg,
    },
    async ({ site_url, feedpath }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const res = await client.get<Sitemap>(
          `/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feedpath)}`,
        );
        return ok(res);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "submit_sitemap",
    "Submit a sitemap (or resubmit an existing one to request reprocessing). The sitemap must be accessible at the given URL within the property. Processing is asynchronous — check status with get_sitemap (isPending, errors, warnings). Requires the service account to have Full permission on the property.",
    {
      site_url: siteArg,
      feedpath: feedpathArg,
    },
    async ({ site_url, feedpath }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        await client.put(
          `/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feedpath)}`,
        );
        return ok({ siteUrl: site, feedpath, submitted: true });
      } catch (e) {
        return err(e);
      }
    },
  );

  if (!allowDestructive) return;

  server.tool(
    "delete_sitemap",
    "Delete a sitemap from Search Console. This removes the submission record; it does not delete the sitemap file from the website or immediately deindex its URLs. Requires GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE and Full permission on the property.",
    {
      site_url: siteArg,
      feedpath: feedpathArg,
    },
    async ({ site_url, feedpath }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        await client.del(
          `/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(feedpath)}`,
        );
        return ok({ siteUrl: site, feedpath, deleted: true });
      } catch (e) {
        return err(e);
      }
    },
  );
}
