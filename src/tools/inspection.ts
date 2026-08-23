import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleSearchConsoleClient } from "../gsc/client.js";
import { ok, err, resolveSite } from "../gsc/format.js";
import { siteArg } from "./shared.js";

interface InspectUrlResponse {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      sitemap?: string[];
      referringUrls?: string[];
      crawledAs?: string;
    };
    ampResult?: unknown;
    mobileUsabilityResult?: unknown;
    richResultsResult?: unknown;
  };
}

export function registerInspectionTools(
  server: McpServer,
  client: GoogleSearchConsoleClient,
  defaultSiteUrl?: string,
) {
  server.tool(
    "inspect_url",
    "Inspect a URL's status in the Google index. Returns inspectionResult with indexStatusResult (verdict PASS/NEUTRAL/FAIL, coverageState e.g. 'Submitted and indexed', indexingState, lastCrawlTime, pageFetchState, robotsTxtState, googleCanonical vs userCanonical, sitemap[] and referringUrls[], crawledAs), plus ampResult and richResultsResult where applicable, and an inspectionResultLink into the Search Console UI. The URL must belong to the property (for a domain property use site_url 'sc-domain:example.com'). Quota: ~2000 calls/day per property, 600/minute — inspect selectively, not in bulk.",
    {
      url: z
        .string()
        .describe("Fully-qualified URL to inspect, e.g. 'https://example.com/pricing'"),
      site_url: siteArg,
      language_code: z
        .string()
        .optional()
        .describe("BCP-47 language for translated result messages, e.g. 'en-US' (default)"),
    },
    async ({ url, site_url, language_code }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const res = await client.post<InspectUrlResponse>("/urlInspection/index:inspect", {
          inspectionUrl: url,
          siteUrl: site,
          ...(language_code ? { languageCode: language_code } : {}),
        });
        return ok({ url, siteUrl: site, ...res });
      } catch (e) {
        return err(e);
      }
    },
  );
}
