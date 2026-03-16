import { Command } from "commander";

import { registerMutationSubcommands } from "./register-mutation-subcommands.js";

export function createMutationCommand(): Command {
  const command = new Command("mutation").description(
    "Execute generated Linear GraphQL mutations.",
  );

  registerMutationSubcommands(command);

  return command;
}
