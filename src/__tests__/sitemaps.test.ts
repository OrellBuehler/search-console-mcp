import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleSearchConsoleClient } from "../gsc/client.js";
import { registerSitemapTools } from "../tools/sitemaps.js";

type Handler = (args: any) => Promise<{ content: { text?: string }[]; isError?: boolean }>;

function collect(defaultSite?: string, allowDestructive = false) {
  const tools = new Map<string, Handler>();
  registerSitemapTools(
    { tool: (n: string, _d: string, _s: unknown, h: Handler) => tools.set(n, h) } as any,
    new GoogleSearchConsoleClient(async () => "tok"),
    defaultSite,
    allowDestructive,
  );
  return tools;
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

const SITEMAP = "https://example.com/sitemap.xml";
const tools = collect("https://example.com/");

describe("sitemap tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it("list_sitemaps lists sitemaps of the default site", async () => {
    mockFetch.mockResolvedValueOnce(resp({ sitemap: [{ path: SITEMAP, errors: "0" }] }));
    const res = await tools.get("list_sitemaps")!({});
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/sitemaps");
    expect(url.searchParams.has("sitemapIndex")).toBe(false);
    expect(JSON.parse(res.content[0].text!).count).toBe(1);
  });

  it("list_sitemaps passes a sitemap index", async () => {
    mockFetch.mockResolvedValueOnce(resp({ sitemap: [] }));
    await tools.get("list_sitemaps")!({ sitemap_index: "https://example.com/index.xml" });
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get("sitemapIndex")).toBe("https://example.com/index.xml");
  });

  it("get_sitemap URL-encodes the feedpath", async () => {
    mockFetch.mockResolvedValueOnce(resp({ path: SITEMAP, isPending: false }));
    const res = await tools.get("get_sitemap")!({ feedpath: SITEMAP });
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe(
      "/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap.xml",
    );
    expect(JSON.parse(res.content[0].text!).isPending).toBe(false);
  });

  it("submit_sitemap PUTs without a body", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    const res = await tools.get("submit_sitemap")!({ feedpath: SITEMAP });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("PUT");
    expect(options.body).toBeUndefined();
    expect(JSON.parse(res.content[0].text!).submitted).toBe(true);
  });

  it("errors without a resolvable site", async () => {
    const res = await collect().get("submit_sitemap")!({ feedpath: SITEMAP });
    expect(res.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("hides delete_sitemap unless destructive tools are enabled", () => {
    expect([...collect("https://example.com/").keys()]).toEqual([
      "list_sitemaps",
      "get_sitemap",
      "submit_sitemap",
    ]);
    expect(collect("https://example.com/", true).has("delete_sitemap")).toBe(true);
  });

  it("delete_sitemap issues a DELETE", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    const res = await collect("https://example.com/", true).get("delete_sitemap")!({
      feedpath: SITEMAP,
    });
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    expect(JSON.parse(res.content[0].text!).deleted).toBe(true);
  });
});
