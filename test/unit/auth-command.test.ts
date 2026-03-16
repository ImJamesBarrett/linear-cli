import { describe, expect, it } from "vitest";

import { createAuthCommand } from "../../src/commands/auth/index.js";

describe("auth command registration", () => {
  it("registers the expected auth command surface", () => {
    const command = createAuthCommand();
    const subcommandNames = command.commands.map((subcommand) => subcommand.name());
    const profiles = command.commands.find((subcommand) => subcommand.name() === "profiles");

    expect(subcommandNames).toEqual([
      "login-api-key",
      "login-oauth",
      "login",
      "login-client-credentials",
      "logout",
      "status",
      "profiles",
    ]);
    expect(profiles?.commands.map((subcommand) => subcommand.name())).toEqual(["list", "use"]);
  });
});
