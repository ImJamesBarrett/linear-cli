import { describe, expect, it } from "vitest";

import { createMutationCommand } from "../../src/commands/mutation/index.js";
import { mutationRegistry } from "../../src/generated/mutation-registry.js";

describe("mutation command registration", () => {
  it("registers every generated mutation subcommand", () => {
    const command = createMutationCommand();
    const subcommandNames = command.commands.map((subcommand) => subcommand.name());

    expect(subcommandNames).toHaveLength(mutationRegistry.entries.length);
    expect(subcommandNames).toContain("issue-create");
    expect(subcommandNames).toContain("user-update");
    expect(subcommandNames).toContain("workflow-state-create");
  });
});
