import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { GoogleSearchConsoleClient } from "../gsc/client.js";
import { registerAnalyticsTools } from "../tools/analytics.js";

type Handler = (args: any) => Promise<{ content: { text?: string }[]; isError?: boolean }>;

function collect(defaultSite?: string) {
  const tools = new Map<string, Handler>();
  const schemas = new Map<string, Record<string, z.ZodTypeAny>>();
  registerAnalyticsTools(
    {
      tool: (n: string, _d: string, s: Record<string, z.ZodTypeAny>, h: Handler) => {
        tools.set(n, h);
        schemas.set(n, s);
      },
    } as any,
    new GoogleSearchConsoleClient(async () => "tok"),
    defaultSite,
  );
  return { tools, schemas };
}

function resp(body: unknown = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  };
}

const ROWS = {
  rows: [
    { keys: ["mcp server"], clicks: 12, impressions: 100, ctr: 0.12, position: 3.4 },
    { keys: ["search console"], clicks: 5, impressions: 80, ctr: 0.0625, position: 7.1 },
  ],
  responseAggregationType: "byProperty",
};

const { tools, schemas } = collect("https://example.com/");

describe("analytics tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 23, 12, 0, 0)));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("query_search_analytics posts the full body", async () => {
    mockFetch.mockResolvedValueOnce(resp(ROWS));
    const res = await tools.get("query_search_analytics")!({
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      dimensions: ["query", "device"],
      search_type: "web",
      filters: [{ dimension: "query", operator: "contains", expression: "mcp" }],
      aggregation_type: "byProperty",
      row_limit: 500,
      start_row: 500,
      data_state: "all",
    });
    const [url, options] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toBe(
      "/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      dimensions: ["query", "device"],
      type: "web",
      dimensionFilterGroups: [
        {
          groupType: "and",
          filters: [{ dimension: "query", operator: "contains", expression: "mcp" }],
        },
      ],
      aggregationType: "byProperty",
      rowLimit: 500,
      startRow: 500,
      dataState: "all",
    });
    const payload = JSON.parse(res.content[0].text!);
    expect(payload.count).toBe(2);
    expect(payload.rows[0].clicks).toBe(12);
  });

  it("query_search_analytics defaults rowLimit to 1000 and omits unset optionals", async () => {
    mockFetch.mockResolvedValueOnce(resp({ rows: [] }));
    await tools.get("query_search_analytics")!({
      start_date: "2026-07-01",
      end_date: "2026-07-31",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31", rowLimit: 1000 });
  });

  it("query_search_analytics enforces the 25000 row cap in its schema", () => {
    const schema = schemas.get("query_search_analytics")!;
    expect(schema.row_limit.safeParse(25000).success).toBe(true);
    expect(schema.row_limit.safeParse(25001).success).toBe(false);
    expect(schema.row_limit.safeParse(0).success).toBe(false);
  });

  it("top_queries defaults to a 28-day range ending 3 days ago with limit 25", async () => {
    mockFetch.mockResolvedValueOnce(resp(ROWS));
    const res = await tools.get("top_queries")!({});
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      startDate: "2026-07-24",
      endDate: "2026-08-20",
      dimensions: ["query"],
      rowLimit: 25,
    });
    const payload = JSON.parse(res.content[0].text!);
    expect(payload.startDate).toBe("2026-07-24");
    expect(payload.count).toBe(2);
  });

  it("top_queries turns page/country/device into equals filters", async () => {
    mockFetch.mockResolvedValueOnce(resp({ rows: [] }));
    await tools.get("top_queries")!({
      page: "https://example.com/pricing",
      country: "che",
      device: "MOBILE",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.dimensionFilterGroups).toEqual([
      {
        groupType: "and",
        filters: [
          { dimension: "page", operator: "equals", expression: "https://example.com/pricing" },
          { dimension: "country", operator: "equals", expression: "che" },
          { dimension: "device", operator: "equals", expression: "MOBILE" },
        ],
      },
    ]);
  });

  it("top_queries lets explicit dates win over the default range", async () => {
    mockFetch.mockResolvedValueOnce(resp({ rows: [] }));
    await tools.get("top_queries")!({ start_date: "2026-01-01", end_date: "2026-01-31" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.startDate).toBe("2026-01-01");
    expect(body.endDate).toBe("2026-01-31");
  });

  it("top_pages groups by page and filters by query substring", async () => {
    mockFetch.mockResolvedValueOnce(resp({ rows: [] }));
    await tools.get("top_pages")!({ query_contains: "mcp", limit: 10 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.dimensions).toEqual(["page"]);
    expect(body.rowLimit).toBe(10);
    expect(body.dimensionFilterGroups[0].filters[0]).toEqual({
      dimension: "query",
      operator: "contains",
      expression: "mcp",
    });
  });

  it("errors without a resolvable site", async () => {
    const res = await collect().tools.get("top_queries")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No site URL given");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
