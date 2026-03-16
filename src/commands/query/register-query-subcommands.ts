import type { Command } from "commander";

import { queryRegistry } from "../../generated/query-registry.js";
import { registerGeneratedOperationSubcommands } from "../generated/register-operation-subcommands.js";

export function registerQuerySubcommands(command: Command): void {
  registerGeneratedOperationSubcommands(command, queryRegistry);
}
