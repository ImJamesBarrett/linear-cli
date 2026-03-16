import type { OutputFormat } from "../../types/cli.js";
import { loadConfigFile } from "../config/load-config.js";
import { formatErrorMessage, resolveExitCode } from "./exit-codes.js";

export interface JsonErrorOutputEnvelope {
  data: null;
  errors: Array<{
    message: string;
  }>;
  exitCode: number;
}

export async function resolveErrorOutputFormat(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  loadConfig: typeof loadConfigFile = loadConfigFile,
): Promise<OutputFormat | null> {
  const argvFormat = parseStringOption(argv, "--format");

  if (argvFormat === "human" || argvFormat === "json") {
    return argvFormat;
  }

  const envFormat = env.LINEAR_FORMAT;

  if (envFormat === "human" || envFormat === "json") {
    return envFormat;
  }

  try {
    const config = await loadConfig();
    const profileName =
      parseStringOption(argv, "--profile") ??
      (typeof env.LINEAR_PROFILE === "string" && env.LINEAR_PROFILE.trim().length > 0
        ? env.LINEAR_PROFILE.trim()
        : config.defaultProfile);

    return config.profiles[profileName]?.format ?? null;
  } catch {
    return null;
  }
}

export function buildJsonErrorOutput(error: unknown): JsonErrorOutputEnvelope | null {
  const message = formatErrorMessage(error);

  if (!message) {
    return null;
  }

  return {
    data: null,
    errors: [{ message }],
    exitCode: resolveExitCode(error),
  };
}

function parseStringOption(argv: string[], optionName: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === optionName) {
      const nextValue = argv[index + 1];
      return typeof nextValue === "string" && nextValue.length > 0 ? nextValue : null;
    }

    if (token.startsWith(`${optionName}=`)) {
      const value = token.slice(optionName.length + 1);
      return value.length > 0 ? value : null;
    }
  }

  return null;
}
