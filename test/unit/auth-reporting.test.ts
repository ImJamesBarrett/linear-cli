import { describe, expect, it } from "vitest";

import { createDefaultConfig } from "../../src/core/config/config-schema.js";
import { upsertProfile } from "../../src/core/config/profiles.js";
import {
  buildAuthStatusReport,
  buildProfilesListReport,
  formatAuthStatusReport,
  formatProfilesListReport,
} from "../../src/commands/auth/reporting.js";

describe("auth reporting", () => {
  it("builds and formats auth status for a profile", () => {
    const config = upsertProfile(createDefaultConfig(), "work", {
      authMode: "oauth",
    });
    const report = buildAuthStatusReport({
      config,
      profileName: "work",
      secrets: {
        accessToken: "token_123",
        actor: "user",
        clientId: "client_123",
        refreshToken: "refresh_123",
        scopes: ["read", "write"],
      },
    });

    expect(report).toMatchObject({
      authMode: "oauth",
      authenticated: true,
      clientId: "client_123",
      hasAccessToken: true,
      hasRefreshToken: true,
      profileName: "work",
      scopes: ["read", "write"],
    });
    expect(formatAuthStatusReport(report)).toContain("Profile: work");
    expect(formatAuthStatusReport(report)).toContain("Scopes: read, write");
  });

  it("builds and formats profile listings", () => {
    const config = upsertProfile(createDefaultConfig(), "work", {
      authMode: "clientCredentials",
    });
    const report = buildProfilesListReport(config);

    expect(report).toEqual([
      {
        authMode: "apiKey",
        defaultProfile: true,
        profileName: "default",
      },
      {
        authMode: "clientCredentials",
        defaultProfile: false,
        profileName: "work",
      },
    ]);
    expect(formatProfilesListReport(report)).toBe(
      "* default (apiKey)\n- work (clientCredentials)",
    );
  });
});
