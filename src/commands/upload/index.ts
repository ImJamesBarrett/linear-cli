import { Command } from "commander";

import { resolveAuthorizationHeader } from "../../core/auth/resolve-authorization.js";
import { loadConfigFile } from "../../core/config/load-config.js";
import { readConfigEnvOverrides, resolveProfileConfig } from "../../core/config/merge-sources.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import { deleteLinearUploadedFile } from "../../core/upload/file-delete.js";
import { uploadLinearFile } from "../../core/upload/file-upload.js";
import { loadJsonInput } from "../../core/util/json-input.js";

export function createUploadCommand(): Command {
  const command = new Command("upload").description(
    "Upload files to Linear storage and delete uploaded assets.",
  );

  command
    .command("file")
    .description("Upload a file to Linear storage.")
    .argument("<path>", "the file to upload")
    .option("--content-type <mime>", "override the inferred MIME type")
    .option("--filename <name>", "override the uploaded filename")
    .option("--size <bytes>", "override the detected file size")
    .option("--make-public", "request a public asset URL if supported")
    .option("--metadata <json|@file>", "attach JSON metadata to the upload")
    .action(async (filePath: string, _options: unknown, invokedCommand: Command) => {
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
      const metadata =
        typeof options.metadata === "string"
          ? await loadJsonInput(options.metadata, {
              cwd: runtimeContext.cwd,
              label: "upload metadata JSON input",
            })
          : undefined;
      const result = await uploadLinearFile({
        authorization,
        baseUrl: profileConfig.baseUrl,
        contentType: typeof options.contentType === "string" ? options.contentType : undefined,
        extraHeaders: profileConfig.headers,
        filePath,
        filename: typeof options.filename === "string" ? options.filename : undefined,
        makePublic: options.makePublic === true,
        metadata,
        publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
        size: parseOptionalSize(options.size),
      });

      if (profileConfig.format === "json") {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(result.assetUrl);
    });

  command
    .command("delete")
    .description("Delete an uploaded asset by its asset URL.")
    .argument("<asset-url>", "the asset URL to delete")
    .action(async (assetUrl: string, invokedCommand: Command) => {
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
      const result = await deleteLinearUploadedFile({
        assetUrl,
        authorization,
        baseUrl: profileConfig.baseUrl,
        extraHeaders: profileConfig.headers,
        publicFileUrlsExpireIn: profileConfig.publicFileUrlsExpireIn,
      });

      if (profileConfig.format === "json") {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Deleted ${assetUrl}.`);
    });

  return command;
}

function parseOptionalSize(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(
      "Upload size must be a non-negative integer.",
      EXIT_CODES.validationFailure,
    );
  }

  return parsed;
}
