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
});

