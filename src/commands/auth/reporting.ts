import type { LinearConfig } from "../../core/config/config-schema.js";
import { listProfiles } from "../../core/config/profiles.js";
import type { StoredProfileSecrets } from "../../core/auth/token-store.js";

export interface AuthStatusReport {
  actor: "app" | "user" | null;
  authMode: string | null;
  authenticated: boolean;
  clientId: string | null;
  defaultProfile: boolean;
  expiresAt: string | null;
  hasAccessToken: boolean;
  hasApiKey: boolean;
  hasRefreshToken: boolean;
  profileName: string;
  scopes: string[];
}

export function buildAuthStatusReport(input: {
  config: LinearConfig;
  profileName: string;
  secrets: StoredProfileSecrets;
}): AuthStatusReport {
  const profile = input.config.profiles[input.profileName] ?? null;

  return {
    actor: input.secrets.actor ?? null,
    authMode: profile?.authMode ?? null,
    authenticated:
      Boolean(input.secrets.apiKey) ||
      Boolean(input.secrets.accessToken) ||
      Boolean(input.secrets.clientSecret && input.secrets.clientId),
    clientId: input.secrets.clientId ?? null,
    defaultProfile: input.config.defaultProfile === input.profileName,
    expiresAt: input.secrets.expiresAt ?? null,
    hasAccessToken: Boolean(input.secrets.accessToken),
    hasApiKey: Boolean(input.secrets.apiKey),
    hasRefreshToken: Boolean(input.secrets.refreshToken),
    profileName: input.profileName,
    scopes: input.secrets.scopes ?? [],
  };
}

export function formatAuthStatusReport(report: AuthStatusReport): string {
  const lines = [
    `Profile: ${report.profileName}${report.defaultProfile ? " (default)" : ""}`,
    `Auth mode: ${report.authMode ?? "unset"}`,
    `Authenticated: ${report.authenticated}`,
    `API key stored: ${report.hasApiKey}`,
    `Access token stored: ${report.hasAccessToken}`,
    `Refresh token stored: ${report.hasRefreshToken}`,
  ];

  if (report.clientId) {
    lines.push(`Client ID: ${report.clientId}`);
  }

  if (report.actor) {
    lines.push(`Actor: ${report.actor}`);
  }

  if (report.expiresAt) {
    lines.push(`Expires at: ${report.expiresAt}`);
  }

  if (report.scopes.length > 0) {
    lines.push(`Scopes: ${report.scopes.join(", ")}`);
  }

  return lines.join("\n");
}

export function buildProfilesListReport(config: LinearConfig): Array<{
  authMode: string | null;
  defaultProfile: boolean;
  profileName: string;
}> {
  return listProfiles(config).map((profileName) => ({
    authMode: config.profiles[profileName]?.authMode ?? null,
    defaultProfile: config.defaultProfile === profileName,
    profileName,
  }));
}

export function formatProfilesListReport(
  profiles: Array<{
    authMode: string | null;
    defaultProfile: boolean;
    profileName: string;
  }>,
): string {
  return profiles
    .map(
      (profile) =>
        `${profile.defaultProfile ? "*" : "-"} ${profile.profileName} (${profile.authMode ?? "unset"})`,
    )
    .join("\n");
}
