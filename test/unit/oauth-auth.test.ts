import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPkcePair } from "../../src/core/auth/pkce.js";
import {
  buildOAuthAuthorizationUrl,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  type FetchLike,
  parseOAuthCallbackUrl,
  persistOAuthSession,
  toOAuthSession,
} from "../../src/core/auth/oauth-auth.js";
import { createPlaintextTokenStore } from "../../src/core/auth/token-store.js";
import { ensureFreshOAuthSession } from "../../src/core/auth/token-refresh.js";

describe("oauth auth helpers", () => {
  it("creates a PKCE verifier and challenge", () => {
    const pair = createPkcePair();

    expect(pair.codeVerifier.length).toBeGreaterThan(20);
    expect(pair.codeChallenge.length).toBeGreaterThan(20);
  });

  it("builds the authorization URL", () => {
    const url = new URL(
      buildOAuthAuthorizationUrl({
        actor: "app",
        clientId: "client-id",
        codeChallenge: "challenge",
        redirectUri: "http://127.0.0.1:9999/oauth/callback",
        scopes: ["read", "write"],
        state: "state-token",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://linear.app/oauth/authorize");
    expect(url.searchParams.get("actor")).toBe("app");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("parses the callback code and state", () => {
    const parsed = parseOAuthCallbackUrl(
      new URL("http://127.0.0.1/oauth/callback?code=auth-code&state=state-token"),
    );

    expect(parsed.error).toBeNull();
    expect(parsed.payload).toEqual({
      code: "auth-code",
      state: "state-token",
    });
    expect(parsed.response.statusCode).toBe(200);
  });

  it("exchanges and refreshes tokens", async () => {
    const fetchImpl = createFetchStub();
    const exchange = await exchangeOAuthAuthorizationCode({
      clientId: "client-id",
      code: "code-123",
      codeVerifier: "verifier-123",
      fetchImpl,
      redirectUri: "http://127.0.0.1/callback",
      tokenUrl: "https://example.com/token",
    });
    const refresh = await exchangeOAuthRefreshToken({
      clientId: "client-id",
      fetchImpl,
      refreshToken: "refresh-123",
      tokenUrl: "https://example.com/token",
    });

    expect(exchange.accessToken).toBe("access-code-123");
    expect(exchange.refreshToken).toBe("refresh-code-123");
    expect(refresh.accessToken).toBe("access-refresh-123");
    expect(refresh.scopes).toEqual(["read", "write"]);
  });

  it("persists and refreshes sessions when they are expiring", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-oauth-"));
    const tokenStore = createPlaintextTokenStore(path.join(tempDir, "credentials.json"));

    try {
      await persistOAuthSession(
        tokenStore,
        "default",
        toOAuthSession({
          clientId: "client-id",
          now: new Date("2026-01-01T00:00:00.000Z"),
          tokenResponse: {
            accessToken: "stale-token",
            expiresIn: 10,
            refreshToken: "refresh-123",
            scopes: ["read"],
            tokenType: "Bearer",
          },
        }),
      );

      const refreshed = await ensureFreshOAuthSession({
        fetchImpl: createFetchStub(),
        now: new Date("2026-01-01T00:00:09.000Z"),
        profileName: "default",
        tokenStore,
        tokenUrl: "https://example.com/token",
      });

      expect(refreshed.accessToken).toBe("access-refresh-123");
      expect(refreshed.refreshToken).toBe("refresh-refresh-123");
      expect(refreshed.scopes).toEqual(["read", "write"]);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});

function createFetchStub(): FetchLike {
  return async (_url, init) => {
    const body = ((init as { body?: { toString(): string } } | undefined)?.body?.toString()) ?? "";
    const params = new URLSearchParams(body);
    const grantType = params.get("grant_type");
    const suffix =
      grantType === "refresh_token" ? params.get("refresh_token") : params.get("code");

    return new Response(
      JSON.stringify({
        access_token: `access-${suffix}`,
        expires_in: 3600,
        refresh_token: `refresh-${suffix}`,
        scope: "read write",
        token_type: "Bearer",
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      },
    );
  };
}
