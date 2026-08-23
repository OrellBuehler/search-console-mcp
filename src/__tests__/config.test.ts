import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "");
    vi.stubEnv("GOOGLE_SEARCH_CONSOLE_SITE_URL", "");
    vi.stubEnv("GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exits when no service account key is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit:1");
    });
    await expect(import("../config.js")).rejects.toThrow("exit:1");
  });

  it("accepts an inline service account key and builds both clients", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", '{"client_email":"a@b.c","private_key":"k"}');
    const { client, inspectionClient } = await import("../config.js");
    expect(client.baseUrl).toBe("https://www.googleapis.com/webmasters/v3");
    expect(inspectionClient.baseUrl).toBe("https://searchconsole.googleapis.com/v1");
  });

  it("accepts a key path and an optional default site", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "/tmp/service-account.json");
    vi.stubEnv("GOOGLE_SEARCH_CONSOLE_SITE_URL", "sc-domain:example.com");
    const { config } = await import("../config.js");
    expect(config.siteUrl).toBe("sc-domain:example.com");
    expect(config.transport).toBe("stdio");
  });

  it("leaves the site undefined when unset", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "/tmp/service-account.json");
    const { config } = await import("../config.js");
    expect(config.siteUrl).toBeUndefined();
  });

  it("keeps destructive tools disabled unless explicitly opted in", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "/tmp/service-account.json");
    const { config } = await import("../config.js");
    expect(config.allowDestructive).toBe(false);
  });

  it("enables destructive tools for 1, true and yes", async () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      vi.resetModules();
      vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "/tmp/service-account.json");
      vi.stubEnv("GOOGLE_SEARCH_CONSOLE_ALLOW_DESTRUCTIVE", value);
      const { config } = await import("../config.js");
      expect(config.allowDestructive).toBe(true);
    }
  });
});
