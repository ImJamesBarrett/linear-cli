import path from "node:path";

import envPaths from "env-paths";
import { z } from "zod";

import type { OutputFormat } from "../../types/cli.js";

export type AuthMode = "apiKey" | "clientCredentials" | "oauth";

export const DEFAULT_BASE_URL = "https://api.linear.app/graphql";
export const DEFAULT_PROFILE_NAME = "default";

export const profileConfigSchema = z.object({
  authMode: z.enum(["apiKey", "clientCredentials", "oauth"]).nullable().default("apiKey"),
  baseUrl: z.string().url().default(DEFAULT_BASE_URL),
  format: z.enum(["human", "json"]).default("human"),
  headers: z.record(z.string(), z.string()).default({}),
  publicFileUrlsExpireIn: z.number().int().positive().nullable().default(null),
});

export const configSchema = z.object({
  defaultProfile: z.string().trim().min(1).default(DEFAULT_PROFILE_NAME),
  profiles: z
    .record(z.string(), profileConfigSchema)
    .default({
      [DEFAULT_PROFILE_NAME]: profileConfigSchema.parse({}),
    }),
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type LinearConfig = z.infer<typeof configSchema>;

export interface ConfigPaths {
  cacheDir: string;
  cacheFile: string;
  configDir: string;
  configFile: string;
  credentialsFile: string;
}

export interface ResolvedProfileConfig {
  authMode: AuthMode | null;
  baseUrl: string;
  format: OutputFormat;
  headers: Record<string, string>;
  profileName: string;
  publicFileUrlsExpireIn: number | null;
}

export function getConfigPaths(): ConfigPaths {
  const paths = envPaths("linear-cli");

  return {
    cacheDir: paths.cache,
    cacheFile: path.join(paths.cache, "cache.json"),
    configDir: paths.config,
    configFile: path.join(paths.config, "config.json"),
    credentialsFile: path.join(paths.config, "credentials.json"),
  };
}

export function createDefaultConfig(): LinearConfig {
  return configSchema.parse({});
}

