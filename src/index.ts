#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { client, inspectionClient, config } from "./config.js";
import { createServer } from "./server.js";

const server = createServer(client, inspectionClient, config.siteUrl, config.allowDestructive);
const transport = new StdioServerTransport();
try {
  await server.connect(transport);
} catch (e) {
  console.error(`Failed to start search-console-mcp: ${String(e)}`);
  process.exit(1);
}
