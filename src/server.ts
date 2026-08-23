import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleSearchConsoleClient } from "./gsc/client.js";
import { registerSitesTools } from "./tools/sites.js";
import { registerSitemapTools } from "./tools/sitemaps.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerInspectionTools } from "./tools/inspection.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export function createServer(
  client: GoogleSearchConsoleClient,
  inspectionClient: GoogleSearchConsoleClient,
  defaultSiteUrl?: string,
  allowDestructive = false,
): McpServer {
  const server = new McpServer({ name: "search-console-mcp", version });
  registerAnalyticsTools(server, client, defaultSiteUrl);
  registerSitemapTools(server, client, defaultSiteUrl, allowDestructive);
  registerSitesTools(server, client, defaultSiteUrl, allowDestructive);
  registerInspectionTools(server, inspectionClient, defaultSiteUrl);
  return server;
}
