import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { createTokenProvider, SCOPES, TOKEN_URL } from "../gsc/auth.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const serviceAccountKey = JSON.stringify({
  type: "service_account",
  client_email: "bot@example.iam.gserviceaccount.com",
  private_key: pem,
  private_key_id: "key-1",
});

function tokenResponse(token: string, expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({ access_token: token, expires_in: expiresIn }),
  };
}

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf-8"));
}

describe("createTokenProvider", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => vi.restoreAllMocks());

  it("signs an RS256 assertion and exchanges it for an access token", async () => {
    mockFetch.mockResolvedValueOnce(tokenResponse("ya29.token"));
    const provider = createTokenProvider({ serviceAccountKey });

    expect(await provider()).toBe("ya29.token");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    const body = new URLSearchParams(options.body as URLSearchParams);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [header, payload] = body.get("assertion")!.split(".");
    expect(decode(header)).toMatchObject({ alg: "RS256", typ: "JWT", kid: "key-1" });
    const claims = decode(payload);
    expect(claims.iss).toBe("bot@example.iam.gserviceaccount.com");
    expect(claims.aud).toBe(TOKEN_URL);
    expect(claims.scope).toBe(SCOPES);
  });

  it("requests the webmasters scope", () => {
    expect(SCOPES).toBe("https://www.googleapis.com/auth/webmasters");
  });

  it("caches the token until close to expiry", async () => {
    mockFetch.mockResolvedValue(tokenResponse("tok-1"));
    let now = 1_700_000_000_000;
    const provider = createTokenProvider({ serviceAccountKey }, () => now);

    expect(await provider()).toBe("tok-1");
    now += 1000 * 1000;
    expect(await provider()).toBe("tok-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    now += 2600 * 1000;
    mockFetch.mockResolvedValue(tokenResponse("tok-2"));
    expect(await provider()).toBe("tok-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("reads the key from a file path", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const path = join(tmpdir(), `gsc-test-key-${process.pid}.json`);
    await writeFile(path, serviceAccountKey);

    mockFetch.mockResolvedValueOnce(tokenResponse("tok-file"));
    const provider = createTokenProvider({ serviceAccountKeyPath: path });
    expect(await provider()).toBe("tok-file");
  });

  it("rejects invalid key JSON", async () => {
    const provider = createTokenProvider({ serviceAccountKey: "not json" });
    await expect(provider()).rejects.toThrow("not valid JSON");
  });

  it("rejects a key missing required fields", async () => {
    const provider = createTokenProvider({ serviceAccountKey: '{"client_email":"a@b.c"}' });
    await expect(provider()).rejects.toThrow("missing client_email or private_key");
  });

  it("throws when no key is configured", async () => {
    const provider = createTokenProvider({});
    await expect(provider()).rejects.toThrow("No Google service account key configured");
  });

  it("surfaces token exchange failures", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: () => Promise.resolve("invalid_grant"),
    });
    const provider = createTokenProvider({ serviceAccountKey });
    await expect(provider()).rejects.toThrow("Google token exchange failed: 400");
  });
});
