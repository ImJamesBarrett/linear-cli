import type { Command } from "commander";

import { loadConfigFile } from "../../core/config/load-config.js";
import { readConfigEnvOverrides, resolveProfileConfig } from "../../core/config/merge-sources.js";
import { executeCanonicalGraphQLOperation } from "../../core/graphql/execute.js";
import { loadSelectionOverride } from "../../core/graphql/selection-input.js";
import { resolveOperationVariables } from "../../core/graphql/variables.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import { loadJsonInput } from "../../core/util/json-input.js";
import { queryRegistry } from "../../generated/query-registry.js";
import type {
  GraphQLTypeRef,
  OperationRegistryEntry,
  RegistryArgumentDefinition,
} from "../../core/registry/types.js";
import { resolveAuthorizationHeader } from "../../core/auth/resolve-authorization.js";

export function registerQuerySubcommands(command: Command): void {
  for (const entry of queryRegistry.entries) {
    const subcommand = command
      .command(entry.cliSubcommand)
      .description(entry.description || `Execute the ${entry.graphqlName} query.`);

    for (const argument of entry.arguments) {
      if (argument.positionalName) {
        subcommand.argument(`<${argument.positionalName}>`);
      }

      if (argument.cliFlag) {
        subcommand.option(getOptionDefinition(entry, argument), argument.description || undefined);
      }
    }

    subcommand.option("--select <fields|@file>", "override the default GraphQL selection set");

    subcommand.action(async (...actionArgs: unknown[]) => {
      const invokedCommand = actionArgs.at(-1);

      if (!isCommand(invokedCommand)) {
        throw new CliError("Invalid commander invocation state.", EXIT_CODES.runtimeFailure);
      }

      const positionals = mapPositionalArguments(entry, actionArgs.slice(0, -1));
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
      const selectionOverride = typeof invokedCommand.optsWithGlobals().select === "string"
        ? await loadSelectionOverride(invokedCommand.optsWithGlobals().select, {
            cwd: runtimeContext.cwd,
          })
        : null;
      const variables = await resolveQueryVariables(
        entry,
        invokedCommand.optsWithGlobals<Record<string, unknown>>(),
        positionals,
        runtimeContext.cwd,
      );
      const envelope = await executeCanonicalGraphQLOperation(entry, {
        allowPartialData: runtimeContext.globalOptions.allowPartialData,
        authorization,
        baseUrl: profileConfig.baseUrl,
        extraHeaders: profileConfig.headers,
        publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
        selectionOverride,
        variables,
      });

      writeCommandOutput(envelope, runtimeContext.globalOptions.format);
    });
  }
}

async function resolveQueryVariables(
  entry: OperationRegistryEntry,
  rawOptions: Record<string, unknown>,
  positionals: Record<string, unknown>,
  cwd: string,
): Promise<Record<string, unknown>> {
  const options: Record<string, unknown> = {};

  for (const argument of entry.arguments) {
    const rawValue = getRawOptionValue(argument, rawOptions, positionals);

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
  rawOptions: Record<string, unknown>,
  positionals: Record<string, unknown>,
): unknown {
  if (argument.positionalName && positionals[argument.positionalName] !== undefined) {
    return positionals[argument.positionalName];
  }

  if (rawOptions[argument.graphqlName] !== undefined) {
    return rawOptions[argument.graphqlName];
  }

  const optionKey = argument.cliFlag?.replace(/^--/, "").replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());

  if (optionKey && rawOptions[optionKey] !== undefined) {
    return rawOptions[optionKey];
  }

  return undefined;
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
  return typeRef.kind === "NAMED" ? typeRef.name : typeRef.ofType ? unwrapNamedType(typeRef.ofType) : null;
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

function writeCommandOutput(
  envelope: { data: unknown; errors: unknown[]; headers: Record<string, string>; rateLimit: unknown; status: number },
  format: "human" | "json",
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

