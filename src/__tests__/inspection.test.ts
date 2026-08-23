import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleSearchConsoleClient, SEARCHCONSOLE_BASE_URL } from "../gsc/client.js";
import { registerInspectionTools } from "../tools/inspection.js";

type Handler = (args: any) => Promise<{ content: { text?: string }[]; isError?: boolean }>;

function collect(defaultSite?: string) {
  const tools = new Map<string, Handler>();
  registerInspectionTools(
    { tool: (n: string, _d: string, _s: unknown, h: Handler) => tools.set(n, h) } as any,
    new GoogleSearchConsoleClient(async () => "tok", SEARCHCONSOLE_BASE_URL),
    defaultSite,
  );
  return tools;
}

function resp(body: unknown = {}) {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  };
}

const tools = collect("sc-domain:example.com");

describe("inspection tools", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it("inspect_url posts to the searchconsole v1 endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      resp({
        inspectionResult: {
          indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" },
        },
      }),
    );
    const res = await tools.get("inspect_url")!({ url: "https://example.com/pricing" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`${SEARCHCONSOLE_BASE_URL}/urlInspection/index:inspect`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      inspectionUrl: "https://example.com/pricing",
      siteUrl: "sc-domain:example.com",
    });
    const payload = JSON.parse(res.content[0].text!);
    expect(payload.inspectionResult.indexStatusResult.verdict).toBe("PASS");
  });

  it("passes the language code through when given", async () => {
    mockFetch.mockResolvedValueOnce(resp({}));
    await tools.get("inspect_url")!({
      url: "https://example.com/",
      site_url: "https://example.com/",
      language_code: "de-CH",
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      inspectionUrl: "https://example.com/",
      siteUrl: "https://example.com/",
      languageCode: "de-CH",
    });
  });

  it("errors without a resolvable site", async () => {
    const res = await collect().get("inspect_url")!({ url: "https://example.com/" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No site URL given");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
