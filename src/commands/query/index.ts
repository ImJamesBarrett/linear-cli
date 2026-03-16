import { Command } from "commander";

import { registerQuerySubcommands } from "./register-query-subcommands.js";

export function createQueryCommand(): Command {
  const command = new Command("query").description(
    "Execute generated Linear GraphQL queries.",
  );

  registerQuerySubcommands(command);

  return command;
}

