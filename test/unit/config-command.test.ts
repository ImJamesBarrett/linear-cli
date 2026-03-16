import { describe, expect, it } from "vitest";

import { createConfigCommand } from "../../src/commands/config/index.js";

describe("config command registration", () => {
  it("registers the expected config subcommands", () => {
    const command = createConfigCommand();

    expect(command.commands.map((subcommand) => subcommand.name())).toEqual([
      "get",
      "set",
      "unset",
      "list",
    ]);
  });
});
