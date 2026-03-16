import { z } from "zod";

import type { GlobalCliOptions } from "../../types/cli.js";
import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import {
  DEFAULT_PROFILE_NAME,
  createDefaultConfig,
  type LinearConfig,
  type ResolvedProfileConfig,
} from "./config-schema.js";

const configEnvSchema = z.object({
  LINEAR_BASE_URL: z.string().url().optional(),
  LINEAR_FORMAT: z.enum(["human", "json"]).optional(),
  LINEAR_PROFILE: z.string().trim().min(1).optional(),
  LINEAR_PUBLIC_FILE_URLS_EXPIRE_IN: z.coerce.number().int().positive().optional(),
});

export type ConfigEnvOverrides = z.infer<typeof configEnvSchema>;

export function readConfigEnvOverrides(
  env: NodeJS.ProcessEnv = process.env,
): ConfigEnvOverrides {
  return configEnvSchema.parse(env);
}

export function resolveProfileConfig({
  cliOptions,
  config,
  envOverrides = readConfigEnvOverrides(),
}: {
  cliOptions: GlobalCliOptions;
  config: LinearConfig;
  envOverrides?: ConfigEnvOverrides;
}): ResolvedProfileConfig {
  const fallbackConfig = createDefaultConfig();
  const profileName =
    cliOptions.profile ??
    envOverrides.LINEAR_PROFILE ??
    config.defaultProfile ??
    DEFAULT_PROFILE_NAME;
  const profile =
    config.profiles[profileName] ??
    fallbackConfig.profiles[profileName] ??
    fallbackConfig.profiles[DEFAULT_PROFILE_NAME];

  if (!profile) {
    throw new CliError(
      `Profile "${profileName}" does not exist.`,
      EXIT_CODES.authOrConfigFailure,
    );
  }

  return {
    authMode: profile.authMode,
    baseUrl: envOverrides.LINEAR_BASE_URL ?? profile.baseUrl,
    format: cliOptions.format ?? envOverrides.LINEAR_FORMAT ?? profile.format,
    headers: {
      ...profile.headers,
      ...parseHeaderValues(cliOptions.headers),
    },
    profileName,
    publicFileUrlsExpireIn:
      cliOptions.publicFileUrlsExpireIn ??
      envOverrides.LINEAR_PUBLIC_FILE_URLS_EXPIRE_IN ??
      profile.publicFileUrlsExpireIn,
  };
}

function parseHeaderValues(headerValues: string[]): Record<string, string> {
  return Object.fromEntries(
    headerValues.map((header) => {
      const separatorIndex = header.indexOf(":");

      if (separatorIndex <= 0) {
        throw new CliError(
          `Invalid header value "${header}". Expected name:value.`,
          EXIT_CODES.validationFailure,
        );
      }

      const name = header.slice(0, separatorIndex).trim();
      const value = header.slice(separatorIndex + 1).trim();

      if (!name || !value) {
        throw new CliError(
          `Invalid header value "${header}". Expected name:value.`,
          EXIT_CODES.validationFailure,
        );
      }

      return [name, value];
    }),
  );
}

