import { readFile } from "node:fs/promises";

import { ZodError } from "zod";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import { configSchema, createDefaultConfig, getConfigPaths, type LinearConfig } from "./config-schema.js";

export async function loadConfigFile(configFilePath = getConfigPaths().configFile): Promise<LinearConfig> {
  try {
    const raw = await readFile(configFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return configSchema.parse(parsed);
  } catch (error) {
    if (isMissingFile(error)) {
      return createDefaultConfig();
    }

    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new CliError(
        `Invalid config file at ${configFilePath}: ${error.message}`,
        EXIT_CODES.authOrConfigFailure,
        { cause: error },
      );
    }

    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

