import { Command } from "commander";

import { resolveAuthorizationHeader } from "../../core/auth/resolve-authorization.js";
import { loadConfigFile } from "../../core/config/load-config.js";
import { readConfigEnvOverrides, resolveProfileConfig } from "../../core/config/merge-sources.js";
import { executeRawGraphQL } from "../../core/graphql/execute.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import { readTextFile } from "../../core/util/fs.js";
import { loadJsonInput } from "../../core/util/json-input.js";

export function createGraphqlCommand(): Command {
  const command = new Command("graphql").description(
    "Execute raw GraphQL documents against the Linear API.",
  );

  command
    .command("raw")
    .description("Execute a raw GraphQL document.")
    .requiredOption("--query <string|@file>", "the GraphQL document or @file path")
    .option("--variables <json|@file>", "JSON variables or @file path")
    .option("--operation-name <name>", "the GraphQL operation name to execute")
    .action(async (_options, invokedCommand: Command) => {
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
      const options = invokedCommand.opts<Record<string, unknown>>();
      const query = await loadRawQuery(requiredStringOption(options.query), runtimeContext.cwd);
      const variables =
        typeof options.variables === "string"
          ? ((await loadJsonInput(options.variables, {
              cwd: runtimeContext.cwd,
              label: "GraphQL variables JSON input",
            })) as Record<string, unknown>)
          : undefined;
      const envelope = await executeRawGraphQL({
        allowPartialData: runtimeContext.globalOptions.allowPartialData,
        authorization,
        baseUrl: profileConfig.baseUrl,
        extraHeaders: profileConfig.headers,
        operationName:
          typeof options.operationName === "string" ? options.operationName : undefined,
        publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
        query,
        variables,
      });

      if (profileConfig.format === "json") {
        console.log(
          JSON.stringify(
            {
              data: envelope.data,
              errors: envelope.errors,
              ...(runtimeContext.globalOptions.verbose
                ? {
                    headers: envelope.headers,
                    rateLimit: envelope.rateLimit,
                  }
                : {}),
            },
            null,
            2,
          ),
        );
        return;
      }

      if (envelope.data !== null) {
        console.log(JSON.stringify(envelope.data, null, 2));
      }

      if (envelope.errors.length > 0) {
        console.error(
          ["Errors:", ...envelope.errors.map((error) => `- ${error.message}`)].join("\n"),
        );
      }

      if (runtimeContext.globalOptions.verbose) {
        console.error(
          `Rate limit: requestsRemaining=${envelope.rateLimit.requestsRemaining ?? "n/a"} complexityRemaining=${envelope.rateLimit.complexityRemaining ?? "n/a"}`,
        );
      }
    });

  return command;
}

async function loadRawQuery(value: string, cwd: string): Promise<string> {
  if (value.startsWith("@")) {
    return readTextFile(value.slice(1), {
      cwd,
      label: "GraphQL document",
    });
  }

  return value;
}

function requiredStringOption(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliError("A GraphQL document is required.", EXIT_CODES.validationFailure);
  }

  return value.trim();
}
