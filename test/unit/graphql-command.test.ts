import { describe, expect, it } from "vitest";

import { createGraphqlCommand } from "../../src/commands/graphql/index.js";

describe("graphql command registration", () => {
  it("registers the raw subcommand", () => {
    const command = createGraphqlCommand();

    expect(command.commands.map((subcommand) => subcommand.name())).toEqual(["raw"]);
  });
});
