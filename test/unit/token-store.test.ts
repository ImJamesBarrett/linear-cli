import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliError } from "../../src/core/runtime/exit-codes.js";
import {
  createKeytarTokenStore,
  createPlaintextTokenStore,
  createTokenStore,
  type KeytarModule,
} from "../../src/core/auth/token-store.js";

describe("token store", () => {
  it("stores and loads plaintext fallback credentials", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-secrets-"));
    const credentialsFilePath = path.join(tempDir, "credentials.json");
    const store = createPlaintextTokenStore(credentialsFilePath);

    await store.setProfileSecrets("default", {
      apiKey: "secret-key",
      refreshToken: "refresh-token",
    });

    expect(await store.getProfileSecrets("default")).toEqual({
      apiKey: "secret-key",
      refreshToken: "refresh-token",
    });

    const saved = await readFile(credentialsFilePath, "utf8");
    expect(saved).toContain("\"apiKey\": \"secret-key\"");
  });

  it("uses keytar when available", async () => {
    const state = new Map<string, string>();
    const store = createKeytarTokenStore({
      async deletePassword(service, account) {
        return state.delete(`${service}:${account}`);
      },
      async getPassword(service, account) {
        return state.get(`${service}:${account}`) ?? null;
      },
      async setPassword(service, account, value) {
        state.set(`${service}:${account}`, value);
      },
    } satisfies KeytarModule);

    await store.setProfileSecrets("work", {
      accessToken: "access-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });

    expect(await store.getProfileSecrets("work")).toEqual({
      accessToken: "access-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });

    await store.clearProfileSecrets("work");
    expect(await store.getProfileSecrets("work")).toEqual({});
  });

  it("requires explicit fallback when keytar is unavailable", async () => {
    await expect(
      createTokenStore({
        allowPlaintextFallback: false,
        loadKeytar: async () => {
          throw new Error("keytar load failed");
        },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });

  it("falls back to plaintext storage when allowed", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-secrets-"));
    const credentialsFilePath = path.join(tempDir, "credentials.json");
    const store = await createTokenStore({
      allowPlaintextFallback: true,
      credentialsFilePath,
      loadKeytar: async () => {
        throw new Error("keytar load failed");
      },
    });

    await store.setProfileSecrets("default", { clientSecret: "client-secret" });

    expect(await store.getProfileSecrets("default")).toEqual({
      clientSecret: "client-secret",
    });
  });
});

