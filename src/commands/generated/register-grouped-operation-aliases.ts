import type { Command } from "commander";

import type { OperationRegistryEntry } from "../../core/registry/types.js";
import { mutationRegistry } from "../../generated/mutation-registry.js";
import { queryRegistry } from "../../generated/query-registry.js";
import { registerGeneratedOperationCommand } from "./register-operation-subcommands.js";

const RESERVED_TOP_LEVEL_COMMANDS = new Set([
  "auth",
  "config",
  "graphql",
  "mutation",
  "query",
  "upload",
]);
const QUERY_ACTION_SEGMENTS = new Set([
  "count",
  "counts",
  "exists",
  "meta",
  "search",
  "status",
  "suggestion",
  "suggestions",
]);

export function registerGroupedOperationAliases(program: Command): void {
  const aliasDefinitions = buildGroupedAliasDefinitions();
  const groups = new Map<string, Command>();

  for (const definition of aliasDefinitions) {
    let parent = program;
    const groupPath = definition.path.slice(0, -1);
    const currentPath: string[] = [];

    for (const segment of groupPath) {
      currentPath.push(segment);
      parent = getOrCreateGroupCommand(groups, parent, currentPath);
    }

    registerGeneratedOperationCommand(
      parent,
      definition.entry,
      definition.path.at(-1)!,
      `${definition.entry.description || `Execute the ${definition.entry.graphqlName} ${definition.entry.kind}.`} Alias for linear ${definition.entry.kind} ${definition.entry.cliSubcommand}.`,
    );
  }
}

interface GroupedAliasDefinition {
  entry: OperationRegistryEntry;
  path: string[];
}

function buildGroupedAliasDefinitions(): GroupedAliasDefinition[] {
  const definitions = [...queryRegistry.entries, ...mutationRegistry.entries]
    .map((entry) => ({
      entry,
      path: toGroupedAliasPath(entry),
    }))
    .filter((definition) => definition.path.length > 1)
    .filter((definition) => !RESERVED_TOP_LEVEL_COMMANDS.has(definition.path[0]));

  const counts = new Map<string, number>();

  for (const definition of definitions) {
    const key = definition.path.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return definitions.filter((definition) => counts.get(definition.path.join(" ")) === 1);
}

function toGroupedAliasPath(entry: OperationRegistryEntry): string[] {
  const parts = entry.cliSubcommand.split("-");
  const root = singularize(parts[0]);

  if (entry.kind === "mutation") {
    return [root, ...parts.slice(1)];
  }

  if (parts.length === 1) {
    if (isPlural(parts[0])) {
      return [root, "list"];
    }

    return [root, "get"];
  }

  const leaf = parts.at(-1)!;

  if (QUERY_ACTION_SEGMENTS.has(leaf)) {
    return [root, ...parts.slice(1)];
  }

  if (isPlural(leaf)) {
    return [root, ...parts.slice(1, -1), singularize(leaf), "list"];
  }

  return [root, ...parts.slice(1), "get"];
}

function singularize(value: string): string {
  if (value === "issues") {
    return "issue";
  }

  if (value === "projects") {
    return "project";
  }

  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("ses")) {
    return value.slice(0, -2);
  }

  if (value.endsWith("s") && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }

  return value;
}

function isPlural(value: string): boolean {
  return singularize(value) !== value;
}

function getOrCreateGroupCommand(
  groups: Map<string, Command>,
  parent: Command,
  pathSegments: string[],
): Command {
  const segment = pathSegments.at(-1)!;
  const key = pathSegments.join(" ");
  const existing = groups.get(key);

  if (existing) {
    return existing;
  }

  const existingChild = parent.commands.find((command) => command.name() === segment);

  if (existingChild) {
    groups.set(key, existingChild);
    return existingChild;
  }

  const command = parent.command(segment).description(`${segment} operations`);
  groups.set(key, command);
  return command;
}
