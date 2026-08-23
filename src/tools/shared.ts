import { z } from "zod";

export const siteArg = z
  .string()
  .optional()
  .describe(
    "Search Console property: URL-prefix property like 'https://example.com/' (trailing slash) or " +
      "domain property like 'sc-domain:example.com' (defaults to GOOGLE_SEARCH_CONSOLE_SITE_URL)",
  );

export const startDateArg = z
  .string()
  .optional()
  .describe("Start date YYYY-MM-DD (default: 28-day range ending 3 days ago, due to data lag)");

export const endDateArg = z
  .string()
  .optional()
  .describe("End date YYYY-MM-DD, inclusive (default: 3 days ago; newer data may be incomplete)");

export const countryArg = z
  .string()
  .optional()
  .describe("Filter to a country as ISO 3166-1 alpha-3 code, e.g. 'usa', 'che', 'deu'");

export const deviceArg = z
  .enum(["DESKTOP", "MOBILE", "TABLET"])
  .optional()
  .describe("Filter to a device type");
