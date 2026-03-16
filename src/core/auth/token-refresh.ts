import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { TokenStore } from "./token-store.js";
import {
  exchangeOAuthRefreshToken,
  loadOAuthSession,
  persistOAuthSession,
  toOAuthSession,
  type OAuthActor,
  type FetchLike,
  type OAuthSession,
} from "./oauth-auth.js";

export interface EnsureFreshOAuthSessionInput {
  actor?: OAuthActor;
  clientId?: string;
  fetchImpl?: FetchLike;
  now?: Date;
  profileName: string;
  refreshWindowMs?: number;
  tokenStore: TokenStore;
  tokenUrl?: string;
}

export async function ensureFreshOAuthSession(
  input: EnsureFreshOAuthSessionInput,
): Promise<OAuthSession> {
  const session = await loadOAuthSession(input.tokenStore, input.profileName);

  if (!session) {
    throw new CliError(
      `No OAuth session is configured for profile "${input.profileName}".`,
      EXIT_CODES.authOrConfigFailure,
    );
  }

  if (!isSessionExpiringSoon(session, input.now, input.refreshWindowMs)) {
    return session;
  }

  if (!session.refreshToken) {
    throw new CliError(
      `OAuth session for profile "${input.profileName}" cannot be refreshed because no refresh token is stored.`,
      EXIT_CODES.authOrConfigFailure,
    );
  }

  const tokenResponse = await exchangeOAuthRefreshToken({
    actor: input.actor ?? session.actor,
    clientId: input.clientId ?? session.clientId,
    fetchImpl: input.fetchImpl,
    refreshToken: session.refreshToken,
    tokenUrl: input.tokenUrl,
  });

  const refreshedSession = toOAuthSession({
    actor: input.actor ?? session.actor,
    clientId: input.clientId ?? session.clientId,
    now: input.now,
    tokenResponse,
  });

  await persistOAuthSession(input.tokenStore, input.profileName, refreshedSession);

  return refreshedSession;
}

export function isSessionExpiringSoon(
  session: OAuthSession,
  now = new Date(),
  refreshWindowMs = 60_000,
): boolean {
  if (!session.expiresAt) {
    return false;
  }

  return new Date(session.expiresAt).getTime() - now.getTime() <= refreshWindowMs;
}
