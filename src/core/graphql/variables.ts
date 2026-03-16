import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { GraphQLTypeRef, OperationRegistryEntry, RegistryArgumentDefinition } from "../registry/types.js";

export interface OperationVariableSource {
  options?: Record<string, unknown>;
  positionals?: Record<string, unknown>;
}

export function buildVariableDefinitions(entry: OperationRegistryEntry): string[] {
  return entry.arguments.map((argument) => `$${argument.graphqlName}: ${renderTypeRef(argument.typeRef)}`);
}

export function buildFieldArgumentBindings(entry: OperationRegistryEntry): string[] {
  return entry.arguments.map((argument) => `${argument.graphqlName}: $${argument.graphqlName}`);
}

export function resolveOperationVariables(
  entry: OperationRegistryEntry,
  source: OperationVariableSource,
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};

  for (const argument of entry.arguments) {
    const value = lookupArgumentValue(argument, source);

    if (value === undefined) {
      if (argument.required) {
        throw new CliError(
          `Missing required argument "${argument.graphqlName}" for ${entry.cliCommand} ${entry.cliSubcommand}.`,
          EXIT_CODES.validationFailure,
        );
      }

      continue;
    }

    variables[argument.graphqlName] = value;
  }

  return variables;
}

export function renderTypeRef(typeRef: GraphQLTypeRef): string {
  if (typeRef.kind === "NON_NULL") {
    return `${renderTypeRef(assertOfType(typeRef))}!`;
  }

  if (typeRef.kind === "LIST") {
    return `[${renderTypeRef(assertOfType(typeRef))}]`;
  }

  return typeRef.name ?? "Unknown";
}

function lookupArgumentValue(
  argument: RegistryArgumentDefinition,
  source: OperationVariableSource,
): unknown {
  const positionals = source.positionals ?? {};
  const options = source.options ?? {};

  if (argument.positionalName) {
    const positionalValue = positionals[argument.positionalName];

    if (positionalValue !== undefined) {
      return positionalValue;
    }
  }

  for (const candidateKey of getArgumentLookupKeys(argument)) {
    if (Object.prototype.hasOwnProperty.call(options, candidateKey)) {
      return options[candidateKey];
    }
  }

  return undefined;
}

function getArgumentLookupKeys(argument: RegistryArgumentDefinition): string[] {
  const keys = new Set<string>([argument.graphqlName]);

  if (argument.cliFlag) {
    const normalizedFlag = argument.cliFlag.replace(/^--/, "");
    keys.add(normalizedFlag);
    keys.add(toCamelCase(normalizedFlag));
  }

  if (argument.positionalName) {
    keys.add(argument.positionalName);
  }

  return [...keys];
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function assertOfType(typeRef: GraphQLTypeRef): GraphQLTypeRef {
  if (!typeRef.ofType) {
    throw new CliError(
      "Encountered an invalid generated GraphQL type reference.",
      EXIT_CODES.runtimeFailure,
    );
  }

  return typeRef.ofType;
}

