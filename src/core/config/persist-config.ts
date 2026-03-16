import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import { configSchema, getConfigPaths, type LinearConfig } from "./config-schema.js";

export async function saveConfigFile(
  config: LinearConfig,
  configFilePath = getConfigPaths().configFile,
): Promise<void> {
  const validated = configSchema.parse(config);
  const directory = path.dirname(configFilePath);
  const tempFilePath = `${configFilePath}.tmp`;

  await mkdir(directory, { recursive: true });
  await writeFile(`${configFilePath}.tmp`, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(tempFilePath, configFilePath);
}

export function ensureProfileExists(config: LinearConfig, profileName: string): void {
  if (!config.profiles[profileName]) {
    throw new CliError(
      `Profile "${profileName}" does not exist.`,
      EXIT_CODES.authOrConfigFailure,
    );
  }
}

