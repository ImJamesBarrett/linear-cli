import { URLSearchParams } from "node:url";

import { fetch } from "undici";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { FetchLike, OAuthActor, OAuthHttpResponse } from "./oauth-auth.js";
import type { TokenStore } from "./token-store.js";

const DEFAULT_TOKEN_URL = "https://api.linear.app/oauth/token";

export interface ClientCredentialsSession {
  accessToken: string;
  actor: OAuthActor;
  clientId: string;
  expiresAt: string | null;
  scopes: string[];
  tokenType: string | null;
}

export interface ClientCredentialsTokenResponse {
  accessToken: string;
  expiresIn: number | null;
  scopes: string[];
  tokenType: string | null;
}

export interface ExchangeClientCredentialsInput {
  actor?: OAuthActor;
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
  scopes?: string[];
  tokenUrl?: string;
}

export interface EnsureFreshClientCredentialsInput {
  actor?: OAuthActor;
  clientId: string;
  clientSecret: string;
  fetchImpl?: FetchLike;
  now?: Date;
  profileName: string;
  refreshWindowMs?: number;
  scopes?: string[];
  tokenStore: TokenStore;
  tokenUrl?: string;
}

export async function exchangeClientCredentialsToken(
  input: ExchangeClientCredentialsInput,
): Promise<ClientCredentialsTokenResponse> {
  const response = await (input.fetchImpl ?? fetch)(input.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      actor: input.actor ?? "app",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "client_credentials",
      ...(input.scopes && input.scopes.length > 0
        ? { scope: input.scopes.join(" ") }
        : {}),
    }).toString(),
  });

  return parseClientCredentialsResponse(response);
}

export async function loadClientCredentialsSession(
  tokenStore: TokenStore,
  profileName: string,
): Promise<ClientCredentialsSession | null> {
  const stored = await tokenStore.getProfileSecrets(profileName);

  if (!stored.accessToken || !stored.clientId) {
    return null;
  }

  return {
    accessToken: stored.accessToken,
    actor: stored.actor ?? "app",
    clientId: stored.clientId,
    expiresAt: stored.expiresAt ?? null,
    scopes: stored.scopes ?? [],
    tokenType: stored.tokenType ?? null,
  };
}

export async function persistClientCredentialsSession(
  tokenStore: TokenStore,
  profileName: string,
  session: ClientCredentialsSession,
  clientSecret?: string,
): Promise<void> {
  await tokenStore.setProfileSecrets(profileName, {
    accessToken: session.accessToken,
    actor: session.actor,
    clientId: session.clientId,
    clientSecret,
    expiresAt: session.expiresAt ?? undefined,
    scopes: session.scopes,
    tokenType: session.tokenType ?? undefined,
  });
}

export function toClientCredentialsSession(input: {
  actor?: OAuthActor;
  clientId: string;
  now?: Date;
  tokenResponse: ClientCredentialsTokenResponse;
}): ClientCredentialsSession {
  return {
    accessToken: input.tokenResponse.accessToken,
    actor: input.actor ?? "app",
    clientId: input.clientId,
    expiresAt: computeExpiresAt(input.tokenResponse.expiresIn, input.now),
    scopes: input.tokenResponse.scopes,
    tokenType: input.tokenResponse.tokenType,
  };
}

export async function ensureFreshClientCredentialsSession(
  input: EnsureFreshClientCredentialsInput,
): Promise<ClientCredentialsSession> {
  const current = await loadClientCredentialsSession(input.tokenStore, input.profileName);

  if (current && !isClientCredentialsSessionExpiringSoon(current, input.now, input.refreshWindowMs)) {
    return current;
  }

  const tokenResponse = await exchangeClientCredentialsToken({
    actor: input.actor,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    fetchImpl: input.fetchImpl,
    scopes: input.scopes,
    tokenUrl: input.tokenUrl,
  });

  const session = toClientCredentialsSession({
    actor: input.actor,
    clientId: input.clientId,
    now: input.now,
    tokenResponse,
  });

  await persistClientCredentialsSession(
    input.tokenStore,
    input.profileName,
    session,
    input.clientSecret,
  );

  return session;
}

export function isClientCredentialsSessionExpiringSoon(
  session: ClientCredentialsSession,
  now = new Date(),
  refreshWindowMs = 60_000,
): boolean {
  if (!session.expiresAt) {
    return false;
  }

  return new Date(session.expiresAt).getTime() - now.getTime() <= refreshWindowMs;
}

function computeExpiresAt(expiresIn: number | null, now = new Date()): string | null {
  if (!expiresIn || expiresIn <= 0) {
    return null;
  }

  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

async function parseClientCredentialsResponse(
  response: OAuthHttpResponse,
): Promise<ClientCredentialsTokenResponse> {
  const raw = (await response.json().catch(async () => ({
    error: await response.text(),
  }))) as
    | {
        access_token?: string;
        error?: string;
        error_description?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
      }
    | undefined;

  if (!response.ok || !raw?.access_token) {
    const message = raw?.error_description ?? raw?.error ?? `HTTP ${response.status}`;
    throw new CliError(
      `OAuth client-credentials exchange failed: ${message}`,
      EXIT_CODES.authOrConfigFailure,
    );
  }

  return {
    accessToken: raw.access_token,
    expiresIn: raw.expires_in ?? null,
    scopes: raw.scope ? raw.scope.split(/\s+/).filter(Boolean) : [],
    tokenType: raw.token_type ?? null,
  };
}

