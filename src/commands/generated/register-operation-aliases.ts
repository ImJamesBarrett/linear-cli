import type { Command } from "commander";

import { mutationRegistry } from "../../generated/mutation-registry.js";
import { queryRegistry } from "../../generated/query-registry.js";
import type { OperationRegistryEntry } from "../../core/registry/types.js";
import { registerGeneratedOperationEntries } from "./register-operation-subcommands.js";

const RESERVED_COMMAND_NAMES = new Set(["auth", "config", "graphql", "mutation", "query", "upload"]);

export function registerGeneratedOperationAliases(program: Command): void {
  registerGeneratedOperationEntries(program, buildAliasEntries(), {
    description: (entry) =>
      `${entry.description || `Execute the ${entry.graphqlName} ${entry.kind}.`} Alias for linear ${entry.kind} ${entry.cliSubcommand}.`,
  });
}

function buildAliasEntries(): OperationRegistryEntry[] {
  const aliasEntries = [...queryRegistry.entries, ...mutationRegistry.entries];
  const counts = new Map<string, number>();

  for (const entry of aliasEntries) {
    counts.set(entry.cliSubcommand, (counts.get(entry.cliSubcommand) ?? 0) + 1);
  }

  return aliasEntries.filter((entry) => {
    return !RESERVED_COMMAND_NAMES.has(entry.cliSubcommand) && counts.get(entry.cliSubcommand) === 1;
  });
}
