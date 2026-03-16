import type { OperationRegistryEntry } from "../registry/types.js";
import { buildDefaultSelection } from "./selection-builder.js";
import { buildFieldArgumentBindings, buildVariableDefinitions } from "./variables.js";

export interface CanonicalDocumentBuildResult {
  operationName: string;
  query: string;
  selection: string;
}

export function buildCanonicalOperationDocument(
  entry: OperationRegistryEntry,
  options: {
    selectionOverride?: string | null;
  } = {},
): CanonicalDocumentBuildResult {
  const selection = options.selectionOverride?.trim() || buildDefaultSelection(entry);
  const variableDefinitions = buildVariableDefinitions(entry);
  const fieldBindings = buildFieldArgumentBindings(entry);
  const operationType = entry.kind;
  const operationName = createOperationName(entry);

  const parts = [`${operationType} ${operationName}`];

  if (variableDefinitions.length > 0) {
    parts.push(`(${variableDefinitions.join(", ")})`);
  }

  const fieldInvocation = fieldBindings.length
    ? `${entry.graphqlName}(${fieldBindings.join(", ")})`
    : entry.graphqlName;

  const selectionBlock = selection ? ` { ${selection} }` : "";

  return {
    operationName,
    query: `${parts.join("")} { ${fieldInvocation}${selectionBlock} }`,
    selection,
  };
}

function createOperationName(entry: OperationRegistryEntry): string {
  return `${toPascalCase(entry.graphqlName)}${entry.kind === "query" ? "Query" : "Mutation"}`;
}

function toPascalCase(value: string): string {
  return value
    .replace(/^_+/, "")
    .replace(/(^|[_-])([a-z0-9])/g, (_, __, character: string) => character.toUpperCase());
}

