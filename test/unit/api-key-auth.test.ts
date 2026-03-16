import { describe, expect, it } from "vitest";

import { CliError } from "../../src/core/runtime/exit-codes.js";
import { resolveApiKeyAuth } from "../../src/core/auth/api-key-auth.js";
import type { TokenStore } from "../../src/core/auth/token-store.js";

describe("resolveApiKeyAuth", () => {
  it("prefers the explicit flag value", async () => {
    const result = await resolveApiKeyAuth({
      explicitApiKey: "flag-key",
      profileName: "default",
      tokenStore: createTokenStoreStub({ apiKey: "profile-key" }),
      env: { LINEAR_API_KEY: "env-key" },
    });

    expect(result).toEqual({
      apiKey: "flag-key",
      source: "flag",
    });
  });

  it("falls back to the environment when no explicit flag is provided", async () => {
    const result = await resolveApiKeyAuth({
      explicitApiKey: null,
      profileName: "default",
      tokenStore: createTokenStoreStub({ apiKey: "profile-key" }),
      env: { LINEAR_API_KEY: "env-key" },
    });

    expect(result).toEqual({
      apiKey: "env-key",
      source: "env",
    });
  });

  it("falls back to stored profile credentials", async () => {
    const result = await resolveApiKeyAuth({
      profileName: "work",
      tokenStore: createTokenStoreStub({ apiKey: "profile-key" }),
      env: {},
    });

    expect(result).toEqual({
      apiKey: "profile-key",
      source: "profile",
    });
  });

  it("throws when no API key is available", async () => {
    await expect(
      resolveApiKeyAuth({
        profileName: "default",
        tokenStore: createTokenStoreStub({}),
        env: {},
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});

function createTokenStoreStub(secrets: { apiKey?: string }): TokenStore {
  return {
    async clearProfileSecrets() {},
    async getProfileSecrets() {
      return secrets;
    },
    async setProfileSecrets() {},
  };
}

