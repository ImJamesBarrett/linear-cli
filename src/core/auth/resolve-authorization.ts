import { z } from "zod";

import { ensureFreshClientCredentialsSession } from "./client-credentials-auth.js";
import { ensureFreshOAuthSession } from "./token-refresh.js";
import { createTokenStore } from "./token-store.js";
import { resolveApiKeyAuth } from "./api-key-auth.js";
import type { ResolvedProfileConfig } from "../config/config-schema.js";

const authEnvSchema = z.object({
  LINEAR_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  LINEAR_ALLOW_PLAINTEXT_CREDENTIALS: z.string().trim().min(1).optional(),
  LINEAR_CLIENT_ID: z.string().trim().min(1).optional(),
  LINEAR_CLIENT_SECRET: z.string().trim().min(1).optional(),
});

export async function resolveAuthorizationHeader(input: {
  env?: NodeJS.ProcessEnv;
  profileConfig: ResolvedProfileConfig;
}): Promise<string | null> {
  const env = authEnvSchema.parse(input.env ?? process.env);

  if (env.LINEAR_ACCESS_TOKEN) {
    return `Bearer ${env.LINEAR_ACCESS_TOKEN}`;
  }

  if (input.profileConfig.authMode === "apiKey" || input.profileConfig.authMode === null) {
    const tokenStore = await maybeCreateTokenStore(env.LINEAR_ALLOW_PLAINTEXT_CREDENTIALS);
    const result = await resolveApiKeyAuth({
      env: input.env,
      profileName: input.profileConfig.profileName,
      tokenStore,
    });

    return result.apiKey;
  }

  const tokenStore = await maybeCreateTokenStore(env.LINEAR_ALLOW_PLAINTEXT_CREDENTIALS);

  if (input.profileConfig.authMode === "oauth") {
    const session = await ensureFreshOAuthSession({
      profileName: input.profileConfig.profileName,
      tokenStore,
    });

    return `Bearer ${session.accessToken}`;
  }

  const storedSecrets = await tokenStore.getProfileSecrets(input.profileConfig.profileName);
  const clientId = env.LINEAR_CLIENT_ID ?? storedSecrets.clientId;
  const clientSecret = env.LINEAR_CLIENT_SECRET ?? storedSecrets.clientSecret;

  if (!clientId || !clientSecret) {
    throw new Error(
      `Client credentials auth for profile "${input.profileConfig.profileName}" requires client ID and client secret.`,
    );
  }

  const session = await ensureFreshClientCredentialsSession({
    clientId,
    clientSecret,
    profileName: input.profileConfig.profileName,
    tokenStore,
  });

  return `Bearer ${session.accessToken}`;
}

async function maybeCreateTokenStore(allowPlaintextFallbackValue?: string): Promise<Awaited<ReturnType<typeof createTokenStore>>> {
  return createTokenStore({
    allowPlaintextFallback: isTruthy(allowPlaintextFallbackValue),
  });
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

