import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CliError } from "../../src/core/runtime/exit-codes.js";
import {
  loadJsonInput,
  loadOptionalJsonInput,
  loadTextInput,
} from "../../src/core/util/json-input.js";

describe("json input helpers", () => {
  it("loads inline text inputs without modification", async () => {
    await expect(loadTextInput("viewer { id }")).resolves.toBe("viewer { id }");
  });

  it("loads text from @file references", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-input-"));
    const inputPath = path.join(tempDir, "selection.graphql");
    await writeFile(inputPath, "viewer { id }\n", "utf8");

    await expect(loadTextInput(`@${inputPath}`)).resolves.toBe("viewer { id }\n");
  });

  it("loads inline JSON values", async () => {
    await expect(loadJsonInput<{ teamId: string }>("{\"teamId\":\"team_123\"}")).resolves.toEqual(
      {
        teamId: "team_123",
      },
    );
  });

  it("loads JSON values from @file references", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-input-"));
    const inputPath = path.join(tempDir, "payload.json");
    await writeFile(inputPath, "{\"teamId\":\"team_123\"}\n", "utf8");

    await expect(loadJsonInput<{ teamId: string }>(`@${inputPath}`)).resolves.toEqual({
      teamId: "team_123",
    });
  });

  it("returns null for optional empty values", async () => {
    await expect(loadOptionalJsonInput(undefined)).resolves.toBeNull();
    await expect(loadOptionalJsonInput(null)).resolves.toBeNull();
  });

  it("throws typed validation errors for malformed JSON", async () => {
    await expect(loadJsonInput("{invalid")).rejects.toBeInstanceOf(CliError);
  });
});

