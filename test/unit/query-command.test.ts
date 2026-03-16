import { describe, expect, it } from "vitest";

import { queryRegistry } from "../../src/generated/query-registry.js";
import { createQueryCommand } from "../../src/commands/query/index.js";

describe("query command registration", () => {
  it("registers every generated query subcommand", () => {
    const command = createQueryCommand();
    const subcommandNames = command.commands.map((subcommand) => subcommand.name());

    expect(subcommandNames).toHaveLength(queryRegistry.entries.length);
    expect(subcommandNames).toContain("issues");
    expect(subcommandNames).toContain("viewer");
    expect(subcommandNames).toContain("dummy");
  });

  it("exposes --all only on connection-returning queries", () => {
    const command = createQueryCommand();
    const issues = command.commands.find((subcommand) => subcommand.name() === "issues");
    const viewer = command.commands.find((subcommand) => subcommand.name() === "viewer");

    expect(issues).toBeDefined();
    expect(viewer).toBeDefined();
    expect(issues!.options.some((option) => option.long === "--all")).toBe(true);
    expect(viewer!.options.some((option) => option.long === "--all")).toBe(false);
  });
});
