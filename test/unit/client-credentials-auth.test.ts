import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureFreshClientCredentialsSession,
  exchangeClientCredentialsToken,
  type ClientCredentialsTokenResponse,
} from "../../src/core/auth/client-credentials-auth.js";
import type { FetchLike } from "../../src/core/auth/oauth-auth.js";
import { createPlaintextTokenStore } from "../../src/core/auth/token-store.js";

describe("client credentials auth", () => {
  it("exchanges a client credentials token", async () => {
    const token = await exchangeClientCredentialsToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: createFetchStub(),
      scopes: ["admin", "read"],
      tokenUrl: "https://example.com/token",
    });

    expect(token).toEqual({
      accessToken: "client-credentials-token",
      expiresIn: 3600,
      scopes: ["admin", "read"],
      tokenType: "Bearer",
    });
  });

  it("reuses a cached session when it is still fresh", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-client-credentials-"));
    const tokenStore = createPlaintextTokenStore(path.join(tempDir, "credentials.json"));

    try {
      await tokenStore.setProfileSecrets("default", {
        accessToken: "cached-token",
        actor: "app",
        clientId: "client-id",
        expiresAt: "2026-01-01T00:10:00.000Z",
      });

      const session = await ensureFreshClientCredentialsSession({
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl: createFetchStub(),
        now: new Date("2026-01-01T00:00:00.000Z"),
        profileName: "default",
        tokenStore,
      });

      expect(session.accessToken).toBe("cached-token");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("refreshes an expired cached session", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-client-credentials-"));
    const tokenStore = createPlaintextTokenStore(path.join(tempDir, "credentials.json"));

    try {
      await tokenStore.setProfileSecrets("default", {
        accessToken: "stale-token",
        actor: "app",
        clientId: "client-id",
        expiresAt: "2026-01-01T00:00:05.000Z",
      });

      const session = await ensureFreshClientCredentialsSession({
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl: createFetchStub(),
        now: new Date("2026-01-01T00:00:10.000Z"),
        profileName: "default",
        scopes: ["admin", "read"],
        tokenStore,
        tokenUrl: "https://example.com/token",
      });

      expect(session.accessToken).toBe("client-credentials-token");
      expect(session.scopes).toEqual(["admin", "read"]);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});

function createFetchStub(
  response: ClientCredentialsTokenResponse = {
    accessToken: "client-credentials-token",
    expiresIn: 3600,
    scopes: ["admin", "read"],
    tokenType: "Bearer",
  },
): FetchLike {
  return async () =>
    new Response(
      JSON.stringify({
        access_token: response.accessToken,
        expires_in: response.expiresIn,
        scope: response.scopes.join(" "),
        token_type: response.tokenType,
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      },
    );
}

