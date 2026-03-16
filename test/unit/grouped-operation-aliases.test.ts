import { describe, expect, it } from "vitest";

import { createProgram } from "../../src/cli/program.js";

describe("grouped operation aliases", () => {
  it("registers grouped aliases for common generated operations", () => {
    const program = createProgram();
    const issueCommand = program.commands.find((command) => command.name() === "issue");

    expect(issueCommand).toBeDefined();
    expect(issueCommand?.commands.some((command) => command.name() === "create")).toBe(true);
    expect(issueCommand?.commands.some((command) => command.name() === "get")).toBe(true);
    expect(issueCommand?.commands.some((command) => command.name() === "list")).toBe(true);
  });

  it("does not expose the old root-level dashed aliases", () => {
    const program = createProgram();
    const topLevelCommands = new Set(program.commands.map((command) => command.name()));

    expect(topLevelCommands.has("issue-create")).toBe(false);
    expect(topLevelCommands.has("issue")).toBe(true);
  });

  it("cleans up irregular plurals and action-first generated names", () => {
    const program = createProgram();
    const topLevelCommands = new Set(program.commands.map((command) => command.name()));
    const releaseCommand = program.commands.find((command) => command.name() === "release");
    const organizationCommand = program.commands.find((command) => command.name() === "organization");

    expect(topLevelCommands.has("releas")).toBe(false);
    expect(releaseCommand?.commands.some((command) => command.name() === "list")).toBe(true);
    expect(topLevelCommands.has("create")).toBe(false);
    expect(organizationCommand?.commands.some((command) => command.name() === "onboarding")).toBe(
      true,
    );
  });
});
