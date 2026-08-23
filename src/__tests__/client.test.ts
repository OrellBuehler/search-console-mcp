import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleSearchConsoleClient,
  WEBMASTERS_BASE_URL,
  SEARCHCONSOLE_BASE_URL,
} from "../gsc/client.js";

function resp(
  body: unknown = {},
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  };
}

describe("GoogleSearchConsoleClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const client = new GoogleSearchConsoleClient(async () => "tok");

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports the expected base URLs", () => {
    expect(WEBMASTERS_BASE_URL).toBe("https://www.googleapis.com/webmasters/v3");
    expect(SEARCHCONSOLE_BASE_URL).toBe("https://searchconsole.googleapis.com/v1");
  });

  it("gets with bearer token and query params, skipping undefined", async () => {
    mockFetch.mockResolvedValueOnce(resp({ a: 1 }));
    const out = await client.get<{ a: number }>("/sites", { x: "1", y: undefined, z: ["a", "b"] });
    expect(out.a).toBe(1);
    const [url, options] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${WEBMASTERS_BASE_URL}/sites`);
    expect(parsed.searchParams.get("x")).toBe("1");
    expect(parsed.searchParams.has("y")).toBe(false);
    expect(parsed.searchParams.get("z")).toBe("a,b");
    expect(options.headers.Authorization).toBe("Bearer tok");
  });

  it("posts JSON bodies with content type", async () => {
    mockFetch.mockResolvedValueOnce(resp({}));
    await client.post("/sites/x/searchAnalytics/query", { startDate: "2026-01-01" });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ startDate: "2026-01-01" });
  });

  it("puts without a body when none is given", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    await client.put("/sites/x/sitemaps/y");
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("PUT");
    expect(options.body).toBeUndefined();
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("tolerates empty response bodies", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    const out = await client.put("/sites/x");
    expect(out).toEqual({});
  });

  it("sends DELETE requests", async () => {
    mockFetch.mockResolvedValueOnce(resp(""));
    await client.del("/sites/x/sitemaps/y");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws readable errors on non-2xx responses", async () => {
    mockFetch.mockResolvedValueOnce(
      resp("nope", { ok: false, status: 403, statusText: "Forbidden" }),
    );
    await expect(client.get("/sites")).rejects.toThrow("403 Forbidden: nope");
  });

  it("converts timeouts into a readable error", async () => {
    mockFetch.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(client.get("/sites")).rejects.toThrow(
      "Search Console request timed out after 30000ms",
    );
  });
});
