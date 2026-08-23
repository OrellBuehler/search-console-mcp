import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleSearchConsoleClient } from "../gsc/client.js";
import { registerSitesTools } from "../tools/sites.js";

type Handler = (args: any) => Promise<{ content: { text?: string }[]; isError?: boolean }>;

function collect(defaultSite?: string, allowDestructive = false) {
  const tools = new Map<string, Handler>();
  registerSitesTools(
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

const tools = collect("https://example.com/");

describe("sites tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it("list_sites fetches all properties", async () => {
    mockFetch.mockResolvedValueOnce(
      resp({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] }),
    );
    const res = await tools.get("list_sites")!({});
    expect(new URL(mockFetch.mock.calls[0][0]).pathname).toBe("/webmasters/v3/sites");
    const payload = JSON.parse(res.content[0].text!);
    expect(payload.count).toBe(1);
    expect(payload.siteEntry[0].permissionLevel).toBe("siteOwner");
  });

  it("get_site URL-encodes the default site", async () => {
    mockFetch.mockResolvedValueOnce(resp({ siteUrl: "https://example.com/" }));
    await tools.get("get_site")!({});
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F");
  });

  it("get_site errors without any site", async () => {
    const res = await collect().get("get_site")!({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No site URL given");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("add_site PUTs the explicit site and never uses the default", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    const res = await tools.get("add_site")!({ site_url: "sc-domain:new.com" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/sites/sc-domain%3Anew.com");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(res.content[0].text!).added).toBe(true);
  });

  it("hides delete_site unless destructive tools are enabled", () => {
    expect([...collect("https://example.com/").keys()]).toEqual([
      "list_sites",
      "get_site",
      "add_site",
    ]);
    expect(collect("https://example.com/", true).has("delete_site")).toBe(true);
  });

  it("delete_site issues a DELETE for the explicit site", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    const res = await collect(undefined, true).get("delete_site")!({
      site_url: "https://old.example.com/",
    });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/sites/https%3A%2F%2Fold.example.com%2F");
    expect(options.method).toBe("DELETE");
    expect(JSON.parse(res.content[0].text!).deleted).toBe(true);
  });
});
