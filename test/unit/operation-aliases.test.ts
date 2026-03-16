import { describe, expect, it } from "vitest";

import { createProgram } from "../../src/cli/program.js";

describe("generated operation aliases", () => {
  it("registers unique root-level aliases for generated operations", () => {
    const program = createProgram();
    const topLevelCommands = new Set(program.commands.map((command) => command.name()));

    expect(topLevelCommands.has("issue-create")).toBe(true);
    expect(topLevelCommands.has("viewer")).toBe(true);
  });

  it("skips ambiguous root-level aliases", () => {
    const program = createProgram();
    const topLevelCommands = new Set(program.commands.map((command) => command.name()));

    expect(topLevelCommands.has("project-update")).toBe(false);
    expect(topLevelCommands.has("initiative-update")).toBe(false);
  });
});
