import http from "node:http";
import { URL, URLSearchParams } from "node:url";

import { fetch } from "undici";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { TokenStore } from "./token-store.js";

const DEFAULT_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const DEFAULT_TOKEN_URL = "https://api.linear.app/oauth/token";

export interface OAuthHttpResponse {
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: unknown,
) => Promise<OAuthHttpResponse>;

export type OAuthActor = "app" | "user";

export interface OAuthStartServerOptions {
  hostname?: string;
  path?: string;
  port?: number;
  timeoutMs?: number;
}

export interface OAuthCallbackPayload {
  code: string;
  state: string | null;
}

export interface OAuthCallbackServer {
  close(): Promise<void>;
  redirectUri: string;
  waitForCallback(): Promise<OAuthCallbackPayload>;
}

export interface OAuthAuthorizationUrlInput {
  actor?: OAuthActor;
  authorizeUrl?: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}

export interface OAuthTokenExchangeInput {
  actor?: OAuthActor;
  clientId: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: FetchLike;
  redirectUri: string;
  tokenUrl?: string;
}

export interface OAuthRefreshInput {
  actor?: OAuthActor;
  clientId: string;
  fetchImpl?: FetchLike;
  refreshToken: string;
  tokenUrl?: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  expiresIn: number | null;
  refreshToken: string | null;
  scopes: string[];
  tokenType: string | null;
}

export interface OAuthSession {
  accessToken: string;
  actor: OAuthActor;
  clientId: string;
  expiresAt: string | null;
  refreshToken: string | null;
  scopes: string[];
  tokenType: string | null;
}

export interface OAuthCallbackResult {
  statusCode: number;
  userMessage: string;
}

export async function startOAuthCallbackServer(
  options: OAuthStartServerOptions = {},
): Promise<OAuthCallbackServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  const callbackPath = options.path ?? "/oauth/callback";
  const timeoutMs = options.timeoutMs ?? 120_000;

  let resolveCallback: ((payload: OAuthCallbackPayload) => void) | null = null;
  let rejectCallback: ((error: unknown) => void) | null = null;

  const callbackPromise = new Promise<OAuthCallbackPayload>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${hostname}`);

      if (requestUrl.pathname !== callbackPath) {
        response.statusCode = 404;
        response.end("Not found.");
        return;
      }

      const parsed = parseOAuthCallbackUrl(requestUrl);

      response.statusCode = parsed.response.statusCode;
      response.end(parsed.response.userMessage);

      if (parsed.error) {
        rejectCallback?.(parsed.error);
        return;
      }

      resolveCallback?.(parsed.payload);
    } finally {
      void closeServer(server);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new CliError(
      "Unable to determine the OAuth callback server address.",
      EXIT_CODES.authOrConfigFailure,
    );
  }

  const timeout = setTimeout(() => {
    rejectCallback?.(
      new CliError(
        "Timed out waiting for the OAuth callback.",
        EXIT_CODES.authOrConfigFailure,
      ),
    );
    void closeServer(server);
  }, timeoutMs);

  timeout.unref();

  return {
    async close() {
      clearTimeout(timeout);
      await closeServer(server);
    },
    redirectUri: `http://${hostname}:${address.port}${callbackPath}`,
    async waitForCallback() {
      try {
        return await callbackPromise;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function parseOAuthCallbackUrl(input: URL): {
  error: CliError | null;
  payload: OAuthCallbackPayload;
  response: OAuthCallbackResult;
} {
  const error = input.searchParams.get("error");

  if (error) {
    return {
      error: new CliError(
        `OAuth authorization failed: ${error}`,
        EXIT_CODES.authOrConfigFailure,
      ),
      payload: {
        code: "",
        state: input.searchParams.get("state"),
      },
      response: {
        statusCode: 400,
        userMessage: "Authentication failed. You can close this window.",
      },
    };
  }

  const code = input.searchParams.get("code");

  if (!code) {
    return {
      error: new CliError(
        "OAuth callback did not include an authorization code.",
        EXIT_CODES.authOrConfigFailure,
      ),
      payload: {
        code: "",
        state: input.searchParams.get("state"),
      },
      response: {
        statusCode: 400,
        userMessage: "Missing authorization code. You can close this window.",
      },
    };
  }

  return {
    error: null,
    payload: {
      code,
      state: input.searchParams.get("state"),
    },
    response: {
      statusCode: 200,
      userMessage: "Authentication complete. You can close this window.",
    },
  };
}

export function buildOAuthAuthorizationUrl(input: OAuthAuthorizationUrlInput): string {
  const url = new URL(input.authorizeUrl ?? DEFAULT_AUTHORIZE_URL);

  url.searchParams.set("actor", input.actor ?? "user");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);

  return url.toString();
}

export async function exchangeOAuthAuthorizationCode(
  input: OAuthTokenExchangeInput,
): Promise<OAuthTokenResponse> {
  const response = await (input.fetchImpl ?? fetch)(input.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      actor: input.actor ?? "user",
      client_id: input.clientId,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }).toString(),
  });

  return parseOAuthTokenResponse(response);
}

export async function exchangeOAuthRefreshToken(
  input: OAuthRefreshInput,
): Promise<OAuthTokenResponse> {
  const response = await (input.fetchImpl ?? fetch)(input.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      actor: input.actor ?? "user",
      client_id: input.clientId,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }).toString(),
  });

  return parseOAuthTokenResponse(response);
}

export async function loadOAuthSession(
  tokenStore: TokenStore,
  profileName: string,
): Promise<OAuthSession | null> {
  const stored = await tokenStore.getProfileSecrets(profileName);

  if (!stored.accessToken || !stored.clientId) {
    return null;
  }

  return {
    accessToken: stored.accessToken,
    actor: stored.actor ?? "user",
    clientId: stored.clientId,
    expiresAt: stored.expiresAt ?? null,
    refreshToken: stored.refreshToken ?? null,
    scopes: stored.scopes ?? [],
    tokenType: stored.tokenType ?? null,
  };
}

export async function persistOAuthSession(
  tokenStore: TokenStore,
  profileName: string,
  session: OAuthSession,
): Promise<void> {
  await tokenStore.setProfileSecrets(profileName, {
    accessToken: session.accessToken,
    actor: session.actor,
    clientId: session.clientId,
    expiresAt: session.expiresAt ?? undefined,
    refreshToken: session.refreshToken ?? undefined,
    scopes: session.scopes,
    tokenType: session.tokenType ?? undefined,
  });
}

export function toOAuthSession(input: {
  actor?: OAuthActor;
  clientId: string;
  now?: Date;
  tokenResponse: OAuthTokenResponse;
}): OAuthSession {
  return {
    accessToken: input.tokenResponse.accessToken,
    actor: input.actor ?? "user",
    clientId: input.clientId,
    expiresAt: computeExpiresAt(input.tokenResponse.expiresIn, input.now),
    refreshToken: input.tokenResponse.refreshToken,
    scopes: input.tokenResponse.scopes,
    tokenType: input.tokenResponse.tokenType,
  };
}

export function computeExpiresAt(expiresIn: number | null, now = new Date()): string | null {
  if (!expiresIn || expiresIn <= 0) {
    return null;
  }

  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

async function parseOAuthTokenResponse(
  response: OAuthHttpResponse,
): Promise<OAuthTokenResponse> {
  const raw = (await response.json().catch(async () => ({
    error: await response.text(),
  }))) as
    | {
        access_token?: string;
        error?: string;
        error_description?: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
        token_type?: string;
      }
    | undefined;

  if (!response.ok || !raw?.access_token) {
    const message = raw?.error_description ?? raw?.error ?? `HTTP ${response.status}`;
    throw new CliError(
      `OAuth token exchange failed: ${message}`,
      EXIT_CODES.authOrConfigFailure,
    );
  }

  return {
    accessToken: raw.access_token,
    expiresIn: raw.expires_in ?? null,
    refreshToken: raw.refresh_token ?? null,
    scopes: raw.scope ? raw.scope.split(/\s+/).filter(Boolean) : [],
    tokenType: raw.token_type ?? null,
  };
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
