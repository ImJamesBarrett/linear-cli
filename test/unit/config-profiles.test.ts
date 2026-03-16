import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDefaultConfig } from "../../src/core/config/config-schema.js";
import { loadConfigFile } from "../../src/core/config/load-config.js";
import { saveConfigFile } from "../../src/core/config/persist-config.js";
import {
  listProfiles,
  removeProfile,
  setDefaultProfile,
  upsertProfile,
} from "../../src/core/config/profiles.js";

describe("config profile helpers", () => {
  it("upserts and lists profiles", () => {
    const config = createDefaultConfig();
    const next = upsertProfile(config, "work", {
      baseUrl: "https://example.com/graphql",
      format: "json",
    });

    expect(listProfiles(next)).toEqual(["default", "work"]);
    expect(next.profiles.work).toMatchObject({
      baseUrl: "https://example.com/graphql",
      format: "json",
    });
  });

  it("reassigns the default profile when the selected profile is removed", () => {
    const config = setDefaultProfile(
      upsertProfile(createDefaultConfig(), "work", {
        format: "json",
      }),
      "work",
    );

    const next = removeProfile(config, "work");

    expect(next.defaultProfile).toBe("default");
    expect(next.profiles.default).toBeDefined();
  });

  it("persists config files as formatted JSON", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-config-"));
    const configFilePath = path.join(tempDir, "config.json");
    const config = upsertProfile(createDefaultConfig(), "work", {
      authMode: "oauth",
    });

    await saveConfigFile(config, configFilePath);

    const saved = await readFile(configFilePath, "utf8");
    const loaded = await loadConfigFile(configFilePath);

    expect(saved.endsWith("\n")).toBe(true);
    expect(loaded).toEqual(config);
  });
});

