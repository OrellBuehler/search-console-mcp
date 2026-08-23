import { describe, it, expect } from "vitest";
import { ok, err, resolveSite, defaultDateRange } from "../gsc/format.js";

describe("ok/err", () => {
  it("stringifies objects and passes strings through", () => {
    expect(ok({ a: 1 }).content[0].text).toBe('{"a":1}');
    expect(ok("plain").content[0].text).toBe("plain");
  });

  it("marks errors and stringifies them", () => {
    const res = err(new Error("boom"));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("boom");
  });
});

describe("resolveSite", () => {
  it("prefers the explicit site over the default", () => {
    expect(resolveSite("https://a.com/", "https://b.com/")).toBe("https://a.com/");
  });

  it("falls back to the default and trims whitespace", () => {
    expect(resolveSite("  ", " sc-domain:example.com ")).toBe("sc-domain:example.com");
  });

  it("throws with guidance when nothing is available", () => {
    expect(() => resolveSite(undefined, undefined)).toThrow("No site URL given");
    expect(() => resolveSite("", "")).toThrow("GOOGLE_SEARCH_CONSOLE_SITE_URL");
  });
});

describe("defaultDateRange", () => {
  const now = () => Date.UTC(2026, 7, 23, 12, 0, 0);

  it("ends 3 days ago and spans 28 days by default", () => {
    const { startDate, endDate } = defaultDateRange(28, 3, now);
    expect(endDate).toBe("2026-08-20");
    expect(startDate).toBe("2026-07-24");
  });

  it("honors custom spans and lag", () => {
    const { startDate, endDate } = defaultDateRange(7, 0, now);
    expect(endDate).toBe("2026-08-23");
    expect(startDate).toBe("2026-08-17");
  });
});
