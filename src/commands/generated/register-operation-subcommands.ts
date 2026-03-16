import type { Command } from "commander";

import { resolveAuthorizationHeader } from "../../core/auth/resolve-authorization.js";
import { loadConfigFile } from "../../core/config/load-config.js";
import {
  readConfigEnvOverrides,
  resolveProfileConfig,
} from "../../core/config/merge-sources.js";
import { executeCanonicalGraphQLOperation } from "../../core/graphql/execute.js";
import { executeAllConnectionPages } from "../../core/graphql/pagination/execute-all.js";
import {
  supportsAllPagination,
  validatePaginationInvocation,
} from "../../core/graphql/pagination/validation.js";
import { loadSelectionOverride } from "../../core/graphql/selection-input.js";
import { resolveOperationVariables } from "../../core/graphql/variables.js";
import type {
  GeneratedRegistry,
  GraphQLTypeRef,
  OperationRegistryEntry,
  RegistryArgumentDefinition,
} from "../../core/registry/types.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import { loadJsonInput } from "../../core/util/json-input.js";
import type { OutputFormat } from "../../types/cli.js";

export function registerGeneratedOperationSubcommands(
  command: Command,
  registry: GeneratedRegistry<OperationRegistryEntry>,
): void {
  for (const entry of registry.entries) {
    const subcommand = command
      .command(entry.cliSubcommand)
      .description(entry.description || `Execute the ${entry.graphqlName} ${entry.kind}.`);

    for (const argument of entry.arguments) {
      if (argument.positionalName) {
        subcommand.argument(`<${argument.positionalName}>`);
      }

      if (argument.cliFlag) {
        subcommand.option(
          getOptionDefinition(entry, argument),
          argument.description || undefined,
        );
      }
    }

    if (supportsAllPagination(entry)) {
      subcommand.option("--all", "fetch all forward pages for connection queries");
    }

    subcommand.option("--select <fields|@file>", "override the default GraphQL selection set");

    subcommand.action(async (...actionArgs: unknown[]) => {
      const invokedCommand = actionArgs.at(-1);

      if (!isCommand(invokedCommand)) {
        throw new CliError("Invalid commander invocation state.", EXIT_CODES.runtimeFailure);
      }

      const positionals = mapPositionalArguments(entry, actionArgs.slice(0, -1));
      const rawOptions = invokedCommand.optsWithGlobals<Record<string, unknown>>();
      const allRequested = getExplicitBooleanOptionValue(invokedCommand, rawOptions, "all");

      validatePaginationInvocation(entry, {
        all: allRequested,
        after: getExplicitOptionValue(invokedCommand, rawOptions, "after"),
        before: getExplicitOptionValue(invokedCommand, rawOptions, "before"),
        first: getExplicitOptionValue(invokedCommand, rawOptions, "first"),
        last: getExplicitOptionValue(invokedCommand, rawOptions, "last"),
      });

      const runtimeContext = createRuntimeContext(invokedCommand);
      const config = await loadConfigFile();
      const profileConfig = resolveProfileConfig({
        cliOptions: runtimeContext.globalOptions,
        config,
        envOverrides: readConfigEnvOverrides(),
      });
      const authorization = await resolveAuthorizationHeader({
        profileConfig,
      });
      const selectionOverride =
        typeof invokedCommand.optsWithGlobals().select === "string"
          ? await loadSelectionOverride(invokedCommand.optsWithGlobals().select, {
              cwd: runtimeContext.cwd,
            })
          : null;
      const variables = await resolveOperationArgumentValues(
        entry,
        invokedCommand,
        positionals,
        runtimeContext.cwd,
      );
      const envelope = allRequested
        ? await executeAllConnectionPages(entry, {
            allowPartialData: runtimeContext.globalOptions.allowPartialData,
            authorization,
            baseUrl: profileConfig.baseUrl,
            extraHeaders: profileConfig.headers,
            publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
            selectionOverride,
            variables,
          })
        : {
            ...(await executeCanonicalGraphQLOperation(entry, {
              allowPartialData: runtimeContext.globalOptions.allowPartialData,
              authorization,
              baseUrl: profileConfig.baseUrl,
              extraHeaders: profileConfig.headers,
              publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
              selectionOverride,
              variables,
            })),
            pagination: null,
          };

      writeCommandOutput(envelope, profileConfig.format);
    });
  }
}

async function resolveOperationArgumentValues(
  entry: OperationRegistryEntry,
  command: Command,
  positionals: Record<string, unknown>,
  cwd: string,
): Promise<Record<string, unknown>> {
  const rawOptions = command.optsWithGlobals<Record<string, unknown>>();
  const options: Record<string, unknown> = {};

  for (const argument of entry.arguments) {
    const rawValue = getRawOptionValue(argument, command, rawOptions, positionals);

    if (rawValue === undefined) {
      continue;
    }

    options[argument.graphqlName] = await coerceArgumentValue(argument, rawValue, cwd);
  }

  return resolveOperationVariables(entry, {
    options,
    positionals,
  });
}

function getRawOptionValue(
  argument: RegistryArgumentDefinition,
  command: Command,
  rawOptions: Record<string, unknown>,
  positionals: Record<string, unknown>,
): unknown {
  if (argument.positionalName && positionals[argument.positionalName] !== undefined) {
    return positionals[argument.positionalName];
  }

  const optionKey = getOptionValueKey(argument);

  if (!optionKey || !wasOptionProvided(command, optionKey)) {
    return undefined;
  }

  return rawOptions[optionKey];
}

async function coerceArgumentValue(
  argument: RegistryArgumentDefinition,
  rawValue: unknown,
  cwd: string,
): Promise<unknown> {
  if (rawValue === undefined || rawValue === null) {
    return rawValue;
  }

  if (argument.kind === "input" || argument.kind === "json" || argument.kind === "list") {
    if (typeof rawValue !== "string") {
      return rawValue;
    }

    return loadJsonInput(rawValue, {
      cwd,
      label: `${argument.graphqlName} JSON input`,
    });
  }

  const typeName = unwrapNamedType(argument.typeRef);

  if (typeName === "Int" && typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsed)) {
      throw new CliError(
        `Invalid integer value for argument "${argument.graphqlName}".`,
        EXIT_CODES.validationFailure,
      );
    }

    return parsed;
  }

  if (typeName === "Float" && typeof rawValue === "string") {
    const parsed = Number.parseFloat(rawValue);

    if (!Number.isFinite(parsed)) {
      throw new CliError(
        `Invalid number value for argument "${argument.graphqlName}".`,
        EXIT_CODES.validationFailure,
      );
    }

    return parsed;
  }

  if (typeName === "Boolean" && typeof rawValue === "string") {
    if (rawValue === "true") {
      return true;
    }

    if (rawValue === "false") {
      return false;
    }
  }

  return rawValue;
}

function unwrapNamedType(typeRef: GraphQLTypeRef): string | null {
  return typeRef.kind === "NAMED"
    ? typeRef.name
    : typeRef.ofType
      ? unwrapNamedType(typeRef.ofType)
      : null;
}

function mapPositionalArguments(
  entry: OperationRegistryEntry,
  values: unknown[],
): Record<string, unknown> {
  const positionals = entry.arguments.filter((argument) => argument.positionalName);
  return Object.fromEntries(
    positionals.map((argument, index) => [argument.positionalName!, values[index]]),
  );
}

function getOptionDefinition(
  entry: OperationRegistryEntry,
  argument: RegistryArgumentDefinition,
): string {
  return (
    entry.flagUsage.find((flag) => flag.startsWith(argument.cliFlag ?? "")) ??
    argument.cliFlag ??
    ""
  );
}

function getOptionValueKey(argument: RegistryArgumentDefinition): string | null {
  if (!argument.cliFlag) {
    return null;
  }

  return argument.cliFlag
    .replace(/^--/, "")
    .replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function wasOptionProvided(command: Command, optionKey: string): boolean {
  const source = command.getOptionValueSource(optionKey);
  return source !== undefined && source !== null && source !== "default";
}

function getExplicitOptionValue(
  command: Command,
  rawOptions: Record<string, unknown>,
  optionKey: string,
): unknown {
  if (!wasOptionProvided(command, optionKey)) {
    return undefined;
  }

  return rawOptions[optionKey];
}

function getExplicitBooleanOptionValue(
  command: Command,
  rawOptions: Record<string, unknown>,
  optionKey: string,
): boolean {
  return getExplicitOptionValue(command, rawOptions, optionKey) === true;
}

function writeCommandOutput(
  envelope: {
    data: unknown;
    errors: unknown[];
    headers: Record<string, string>;
    pagination: unknown;
    rateLimit: unknown;
    status: number;
  },
  format: OutputFormat,
): void {
  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          data: envelope.data,
          errors: envelope.errors,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(JSON.stringify(envelope.data, null, 2));
}

function isCommand(value: unknown): value is Command {
  return typeof value === "object" && value !== null && "optsWithGlobals" in value;
}
