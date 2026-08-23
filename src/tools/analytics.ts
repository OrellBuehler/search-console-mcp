import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleSearchConsoleClient } from "../gsc/client.js";
import { ok, err, resolveSite, defaultDateRange } from "../gsc/format.js";
import { siteArg, startDateArg, endDateArg, countryArg, deviceArg } from "./shared.js";

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

interface DimensionFilter {
  dimension: string;
  operator: string;
  expression: string;
}

interface QueryBody {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  type?: string;
  dimensionFilterGroups?: Array<{ groupType: "and"; filters: DimensionFilter[] }>;
  aggregationType?: string;
  rowLimit?: number;
  startRow?: number;
  dataState?: string;
}

async function runQuery(
  client: GoogleSearchConsoleClient,
  site: string,
  body: QueryBody,
): Promise<{ count: number } & SearchAnalyticsResponse> {
  const res = await client.post<SearchAnalyticsResponse>(
    `/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    body,
  );
  return { count: (res.rows ?? []).length, ...res };
}

function buildFilters(filters: DimensionFilter[]): QueryBody["dimensionFilterGroups"] {
  if (filters.length === 0) return undefined;
  return [{ groupType: "and", filters }];
}

export function registerAnalyticsTools(
  server: McpServer,
  client: GoogleSearchConsoleClient,
  defaultSiteUrl?: string,
) {
  server.tool(
    "query_search_analytics",
    "Query Google Search performance data for a property. Returns rows[] where each row has keys[] (one value per requested dimension, in order) plus clicks, impressions, ctr (0-1) and position (average, 1 = top). Rows are sorted by clicks descending (by date when grouping by date). Data lags ~2-3 days and is retained for 16 months; totals are privacy-filtered so summed rows can undercount. Max 25000 rows per call; if count equals row_limit, fetch the next page with start_row = previous start_row + row_limit (a response with fewer rows is the last page). The 'hour' dimension requires data_state 'hourly_all' and a date range within the last 10 days. For a quick overview use top_queries or top_pages instead.",
    {
      site_url: siteArg,
      start_date: z.string().describe("Start date YYYY-MM-DD (data is retained for 16 months)"),
      end_date: z
        .string()
        .describe("End date YYYY-MM-DD, inclusive (data for the last ~2-3 days is incomplete)"),
      dimensions: z
        .array(z.enum(["date", "query", "page", "country", "device", "searchAppearance", "hour"]))
        .optional()
        .describe(
          "Dimensions to group by, e.g. ['query'] or ['date','device']. Omit for aggregate totals over the whole range.",
        ),
      search_type: z
        .enum(["web", "image", "video", "news", "discover", "googleNews"])
        .optional()
        .describe(
          "Search surface to report on (default: web). 'discover' and 'googleNews' don't support the query/page dimensions the same way.",
        ),
      filters: z
        .array(
          z.object({
            dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
            operator: z.enum([
              "equals",
              "contains",
              "notContains",
              "includingRegex",
              "excludingRegex",
            ]),
            expression: z.string(),
          }),
        )
        .optional()
        .describe(
          "Filters ANDed together, e.g. [{dimension:'query',operator:'contains',expression:'mcp'}]. Regex operators use RE2 syntax.",
        ),
      aggregation_type: z
        .enum(["auto", "byPage", "byProperty"])
        .optional()
        .describe(
          "How to aggregate (default: auto). byProperty is not supported with the page dimension.",
        ),
      row_limit: z
        .number()
        .int()
        .min(1)
        .max(25000)
        .optional()
        .describe("Max rows to return (default: 1000, max 25000)"),
      start_row: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Zero-based row offset for pagination (default: 0)"),
      data_state: z
        .enum(["final", "all", "hourly_all"])
        .optional()
        .describe(
          "'final' (default) for finalized data only, 'all' to include fresh data, 'hourly_all' when grouping by hour",
        ),
    },
    async ({
      site_url,
      start_date,
      end_date,
      dimensions,
      search_type,
      filters,
      aggregation_type,
      row_limit,
      start_row,
      data_state,
    }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const body: QueryBody = {
          startDate: start_date,
          endDate: end_date,
          dimensions,
          type: search_type,
          dimensionFilterGroups: filters ? buildFilters(filters) : undefined,
          aggregationType: aggregation_type,
          rowLimit: row_limit ?? 1000,
          startRow: start_row,
          dataState: data_state,
        };
        return ok({ siteUrl: site, ...(await runQuery(client, site, body)) });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "top_queries",
    "Top search queries for a property by clicks. Each row has keys[0] = the query plus clicks, impressions, ctr (0-1) and position (average, 1 = top). Defaults to the last 28 days ending 3 days ago (data lag). Optionally narrow to one page, country or device. For other dimensions, regex filters, Discover/News data or pagination use query_search_analytics.",
    {
      site_url: siteArg,
      start_date: startDateArg,
      end_date: endDateArg,
      limit: z
        .number()
        .int()
        .min(1)
        .max(25000)
        .optional()
        .describe("Max queries to return (default: 25)"),
      page: z
        .string()
        .optional()
        .describe("Restrict to one page's queries, full URL e.g. 'https://example.com/pricing'"),
      country: countryArg,
      device: deviceArg,
    },
    async ({ site_url, start_date, end_date, limit, page, country, device }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const range = defaultDateRange();
        const filters: DimensionFilter[] = [];
        if (page) filters.push({ dimension: "page", operator: "equals", expression: page });
        if (country)
          filters.push({ dimension: "country", operator: "equals", expression: country });
        if (device) filters.push({ dimension: "device", operator: "equals", expression: device });
        const body: QueryBody = {
          startDate: start_date ?? range.startDate,
          endDate: end_date ?? range.endDate,
          dimensions: ["query"],
          dimensionFilterGroups: buildFilters(filters),
          rowLimit: limit ?? 25,
        };
        return ok({
          siteUrl: site,
          startDate: body.startDate,
          endDate: body.endDate,
          ...(await runQuery(client, site, body)),
        });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "top_pages",
    "Top pages for a property by clicks from Google Search. Each row has keys[0] = the page URL plus clicks, impressions, ctr (0-1) and position (average, 1 = top). Defaults to the last 28 days ending 3 days ago (data lag). Optionally narrow to queries containing a string, or to a country or device. For other dimensions, regex filters, Discover/News data or pagination use query_search_analytics.",
    {
      site_url: siteArg,
      start_date: startDateArg,
      end_date: endDateArg,
      limit: z
        .number()
        .int()
        .min(1)
        .max(25000)
        .optional()
        .describe("Max pages to return (default: 25)"),
      query_contains: z
        .string()
        .optional()
        .describe("Only count impressions/clicks from queries containing this substring"),
      country: countryArg,
      device: deviceArg,
    },
    async ({ site_url, start_date, end_date, limit, query_contains, country, device }) => {
      try {
        const site = resolveSite(site_url, defaultSiteUrl);
        const range = defaultDateRange();
        const filters: DimensionFilter[] = [];
        if (query_contains)
          filters.push({ dimension: "query", operator: "contains", expression: query_contains });
        if (country)
          filters.push({ dimension: "country", operator: "equals", expression: country });
        if (device) filters.push({ dimension: "device", operator: "equals", expression: device });
        const body: QueryBody = {
          startDate: start_date ?? range.startDate,
          endDate: end_date ?? range.endDate,
          dimensions: ["page"],
          dimensionFilterGroups: buildFilters(filters),
          rowLimit: limit ?? 25,
        };
        return ok({
          siteUrl: site,
          startDate: body.startDate,
          endDate: body.endDate,
          ...(await runQuery(client, site, body)),
        });
      } catch (e) {
        return err(e);
      }
    },
  );
}
