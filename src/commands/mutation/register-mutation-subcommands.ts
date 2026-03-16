import type { Command } from "commander";

import { mutationRegistry } from "../../generated/mutation-registry.js";
import { registerGeneratedOperationSubcommands } from "../generated/register-operation-subcommands.js";

export function registerMutationSubcommands(command: Command): void {
  registerGeneratedOperationSubcommands(command, mutationRegistry);
}
