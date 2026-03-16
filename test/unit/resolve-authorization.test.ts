import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTokenStoreMock,
  resolveApiKeyAuthMock,
  ensureFreshOAuthSessionMock,
  ensureFreshClientCredentialsSessionMock,
} = vi.hoisted(() => ({
  createTokenStoreMock: vi.fn(),
  resolveApiKeyAuthMock: vi.fn(),
  ensureFreshOAuthSessionMock: vi.fn(),
  ensureFreshClientCredentialsSessionMock: vi.fn(),
}));

vi.mock("../../src/core/auth/token-store.js", () => ({
  createTokenStore: createTokenStoreMock,
}));

vi.mock("../../src/core/auth/api-key-auth.js", () => ({
  resolveApiKeyAuth: resolveApiKeyAuthMock,
}));

vi.mock("../../src/core/auth/token-refresh.js", () => ({
  ensureFreshOAuthSession: ensureFreshOAuthSessionMock,
}));

vi.mock("../../src/core/auth/client-credentials-auth.js", () => ({
  ensureFreshClientCredentialsSession: ensureFreshClientCredentialsSessionMock,
}));

import { resolveAuthorizationHeader } from "../../src/core/auth/resolve-authorization.js";
import { CliError } from "../../src/core/runtime/exit-codes.js";

describe("authorization resolution", () => {
  beforeEach(() => {
    createTokenStoreMock.mockReset();
    resolveApiKeyAuthMock.mockReset();
    ensureFreshOAuthSessionMock.mockReset();
    ensureFreshClientCredentialsSessionMock.mockReset();
  });

  it("prefers an explicit LINEAR_ACCESS_TOKEN override", async () => {
    await expect(
      resolveAuthorizationHeader({
        env: {
          LINEAR_ACCESS_TOKEN: "access-token",
        },
        profileConfig: {
          authMode: "oauth",
          baseUrl: "https://api.linear.app/graphql",
          format: "human",
          headers: {},
          profileName: "default",
          publicFileUrlsExpireIn: null,
        },
      }),
    ).resolves.toBe("Bearer access-token");

    expect(createTokenStoreMock).not.toHaveBeenCalled();
  });

  it("resolves API key auth through the token store path", async () => {
    createTokenStoreMock.mockResolvedValue({
      getProfileSecrets: vi.fn(),
    });
    resolveApiKeyAuthMock.mockResolvedValue({
      apiKey: "lin-api-key",
      source: "profile",
    });

    await expect(
      resolveAuthorizationHeader({
        env: {
          LINEAR_ALLOW_PLAINTEXT_CREDENTIALS: "true",
        },
        profileConfig: {
          authMode: "apiKey",
          baseUrl: "https://api.linear.app/graphql",
          format: "human",
          headers: {},
          profileName: "default",
          publicFileUrlsExpireIn: null,
        },
      }),
    ).resolves.toBe("lin-api-key");

    expect(resolveApiKeyAuthMock).toHaveBeenCalled();
  });

  it("returns a bearer token for OAuth sessions", async () => {
    createTokenStoreMock.mockResolvedValue({
      getProfileSecrets: vi.fn(),
    });
    ensureFreshOAuthSessionMock.mockResolvedValue({
      accessToken: "oauth-token",
    });

    await expect(
      resolveAuthorizationHeader({
        env: {
          LINEAR_ALLOW_PLAINTEXT_CREDENTIALS: "true",
        },
        profileConfig: {
          authMode: "oauth",
          baseUrl: "https://api.linear.app/graphql",
          format: "human",
          headers: {},
          profileName: "default",
          publicFileUrlsExpireIn: null,
        },
      }),
    ).resolves.toBe("Bearer oauth-token");
  });

  it("uses client credentials from env overrides and stored secrets", async () => {
    createTokenStoreMock.mockResolvedValue({
      getProfileSecrets: vi.fn().mockResolvedValue({
        clientId: "stored-client-id",
        clientSecret: "stored-client-secret",
      }),
    });
    ensureFreshClientCredentialsSessionMock.mockResolvedValue({
      accessToken: "client-credentials-token",
    });

    await expect(
      resolveAuthorizationHeader({
        env: {
          LINEAR_ALLOW_PLAINTEXT_CREDENTIALS: "true",
          LINEAR_CLIENT_SECRET: "override-secret",
        },
        profileConfig: {
          authMode: "clientCredentials",
          baseUrl: "https://api.linear.app/graphql",
          format: "human",
          headers: {},
          profileName: "default",
          publicFileUrlsExpireIn: null,
        },
      }),
    ).resolves.toBe("Bearer client-credentials-token");

    expect(ensureFreshClientCredentialsSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "stored-client-id",
        clientSecret: "override-secret",
      }),
    );
  });

  it("raises a configuration error when client credentials are missing", async () => {
    createTokenStoreMock.mockResolvedValue({
      getProfileSecrets: vi.fn().mockResolvedValue({}),
    });

    await expect(
      resolveAuthorizationHeader({
        env: {
          LINEAR_ALLOW_PLAINTEXT_CREDENTIALS: "true",
        },
        profileConfig: {
          authMode: "clientCredentials",
          baseUrl: "https://api.linear.app/graphql",
          format: "human",
          headers: {},
          profileName: "default",
          publicFileUrlsExpireIn: null,
        },
      }),
    ).rejects.toThrow(CliError);
  });
});
