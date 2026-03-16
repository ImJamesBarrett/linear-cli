import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadSelectionOverride,
  normalizeSelectionOverride,
} from "../../src/core/graphql/selection-input.js";

describe("selection override input", () => {
  it("normalizes inline selections", () => {
    expect(normalizeSelectionOverride(" viewer { id } ")).toBe("viewer { id }");
  });

  it("strips outer braces from full selection blocks", () => {
    expect(normalizeSelectionOverride("{ viewer { id } }")).toBe("viewer { id }");
  });

  it("loads selection overrides from @file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-selection-"));
    const selectionPath = path.join(tempDir, "selection.graphql");
    await writeFile(selectionPath, "{ viewer { id } }\n", "utf8");

    await expect(loadSelectionOverride(`@${selectionPath}`)).resolves.toBe("viewer { id }");
  });
});

