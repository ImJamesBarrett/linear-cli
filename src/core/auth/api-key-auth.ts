import { z } from "zod";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { TokenStore } from "./token-store.js";

const authEnvSchema = z.object({
  LINEAR_API_KEY: z.string().trim().min(1).optional(),
});

export interface ResolveApiKeyAuthInput {
  env?: NodeJS.ProcessEnv;
  explicitApiKey?: string | null;
  profileName: string;
  tokenStore: TokenStore;
}

export interface ApiKeyAuthResult {
  apiKey: string;
  source: "env" | "flag" | "profile";
}

export async function resolveApiKeyAuth(
  input: ResolveApiKeyAuthInput,
): Promise<ApiKeyAuthResult> {
  const explicitApiKey = input.explicitApiKey?.trim();

  if (explicitApiKey) {
    return {
      apiKey: explicitApiKey,
      source: "flag",
    };
  }

  const envOverrides = readAuthEnvOverrides(input.env);

  if (envOverrides.LINEAR_API_KEY) {
    return {
      apiKey: envOverrides.LINEAR_API_KEY,
      source: "env",
    };
  }

  const storedSecrets = await input.tokenStore.getProfileSecrets(input.profileName);

  if (storedSecrets.apiKey) {
    return {
      apiKey: storedSecrets.apiKey,
      source: "profile",
    };
  }

  throw new CliError(
    `No Linear API key is configured for profile "${input.profileName}".`,
    EXIT_CODES.authOrConfigFailure,
  );
}

export function readAuthEnvOverrides(
  env: NodeJS.ProcessEnv = process.env,
): z.infer<typeof authEnvSchema> {
  return authEnvSchema.parse(env);
}
