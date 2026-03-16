import { randomBytes } from "node:crypto";

import { Command } from "commander";

import {
  buildOAuthAuthorizationUrl,
  exchangeOAuthAuthorizationCode,
  persistOAuthSession,
  startOAuthCallbackServer,
  toOAuthSession,
  type OAuthActor,
} from "../../core/auth/oauth-auth.js";
import {
  ensureFreshClientCredentialsSession,
  loadClientCredentialsSession,
} from "../../core/auth/client-credentials-auth.js";
import { createPkcePair } from "../../core/auth/pkce.js";
import { createTokenStore, type StoredProfileSecrets } from "../../core/auth/token-store.js";
import { loadOAuthSession } from "../../core/auth/oauth-auth.js";
import { loadConfigFile } from "../../core/config/load-config.js";
import { saveConfigFile } from "../../core/config/persist-config.js";
import {
  DEFAULT_PROFILE_NAME,
  type AuthMode,
  type LinearConfig,
} from "../../core/config/config-schema.js";
import { listProfiles, setDefaultProfile, upsertProfile } from "../../core/config/profiles.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import {
  buildAuthStatusReport,
  buildProfilesListReport,
  formatAuthStatusReport,
  formatProfilesListReport,
} from "./reporting.js";

const DEFAULT_OAUTH_ACTOR: OAuthActor = "user";
const DEFAULT_CLIENT_CREDENTIALS_ACTOR: OAuthActor = "app";

export function createAuthCommand(): Command {
  const command = new Command("auth").description(
    "Authenticate the CLI using personal API key, OAuth2, or client credentials.",
  );

  registerLoginApiKeyCommand(command);
  registerLoginOauthCommand(command, "login-oauth");
  registerLoginOauthCommand(command, "login");
  registerLoginClientCredentialsCommand(command);
  registerLogoutCommand(command);
  registerStatusCommand(command);
  registerProfilesCommand(command);

  return command;
}

function registerLoginApiKeyCommand(command: Command): void {
  command
    .command("login-api-key")
    .description("Store a personal Linear API key for the selected profile.")
    .requiredOption("--api-key <value>", "the Linear API key to store")
    .action(async (_options, invokedCommand: Command) => {
      const profileName = await resolveProfileName(invokedCommand);
      const tokenStore = await createCliTokenStore();
      const config = await loadConfigFile();
      const apiKey = invokedCommand.opts<Record<string, unknown>>().apiKey;

      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw new CliError("An API key is required.", EXIT_CODES.validationFailure);
      }

      await tokenStore.setProfileSecrets(profileName, {
        apiKey: apiKey.trim(),
      });
      await saveProfileAuthMode(config, profileName, "apiKey");
      writeUtilityOutput(
        invokedCommand,
        {
          authMode: "apiKey",
          authenticated: true,
          profileName,
          source: "login-api-key",
        },
        `Stored API key credentials for profile "${profileName}".`,
      );
    });
}

function registerLoginOauthCommand(command: Command, subcommandName: string): void {
  command
    .command(subcommandName)
    .description(
      subcommandName === "login"
        ? "Authenticate using OAuth 2.0 auth code + PKCE."
        : "Authenticate using OAuth 2.0 auth code + PKCE.",
    )
    .requiredOption("--client-id <value>", "the OAuth client ID to use")
    .option("--actor <user|app>", "OAuth actor mode", DEFAULT_OAUTH_ACTOR)
    .option("--redirect-port <port>", "local loopback port to use for the callback")
    .option("--scopes <csv>", "comma-separated OAuth scopes", parseCsvOption, [])
    .action(async (_options, invokedCommand: Command) => {
      const profileName = await resolveProfileName(invokedCommand);
      const tokenStore = await createCliTokenStore();
      const config = await loadConfigFile();
      const options = invokedCommand.opts<Record<string, unknown>>();
      const clientId = requiredStringOption(options.clientId, "client ID");
      const actor = parseActorOption(options.actor, DEFAULT_OAUTH_ACTOR);
      const redirectPort = parseOptionalPort(options.redirectPort);
      const scopes = parseScopesOption(options.scopes);
      const callbackServer = await startOAuthCallbackServer({
        port: redirectPort ?? undefined,
      });
      const pkce = createPkcePair();
      const state = randomBytes(16).toString("hex");
      const authorizationUrl = buildOAuthAuthorizationUrl({
        actor,
        clientId,
        codeChallenge: pkce.codeChallenge,
        redirectUri: callbackServer.redirectUri,
        scopes,
        state,
      });

      console.error("Open this URL to authorize the CLI:");
      console.error(authorizationUrl);

      try {
        const callback = await callbackServer.waitForCallback();

        if (callback.state !== state) {
          throw new CliError(
            "OAuth callback state mismatch.",
            EXIT_CODES.authOrConfigFailure,
          );
        }

        const tokenResponse = await exchangeOAuthAuthorizationCode({
          actor,
          clientId,
          code: callback.code,
          codeVerifier: pkce.codeVerifier,
          redirectUri: callbackServer.redirectUri,
        });
        const session = toOAuthSession({
          actor,
          clientId,
          tokenResponse,
        });

        await persistOAuthSession(tokenStore, profileName, session);
        await saveProfileAuthMode(config, profileName, "oauth");
      } finally {
        await callbackServer.close();
      }

      writeUtilityOutput(
        invokedCommand,
        {
          actor,
          authMode: "oauth",
          authenticated: true,
          clientId,
          profileName,
          scopes,
          source: subcommandName,
        },
        `Stored OAuth credentials for profile "${profileName}".`,
      );
    });
}

function registerLoginClientCredentialsCommand(command: Command): void {
  command
    .command("login-client-credentials")
    .description("Exchange client credentials and store the resulting access token.")
    .requiredOption("--client-id <value>", "the OAuth client ID to use")
    .requiredOption("--client-secret <value>", "the OAuth client secret to use")
    .option("--actor <user|app>", "OAuth actor mode", DEFAULT_CLIENT_CREDENTIALS_ACTOR)
    .option("--scopes <csv>", "comma-separated OAuth scopes", parseCsvOption, [])
    .action(async (_options, invokedCommand: Command) => {
      const profileName = await resolveProfileName(invokedCommand);
      const tokenStore = await createCliTokenStore();
      const config = await loadConfigFile();
      const options = invokedCommand.opts<Record<string, unknown>>();
      const clientId = requiredStringOption(options.clientId, "client ID");
      const clientSecret = requiredStringOption(options.clientSecret, "client secret");
      const actor = parseActorOption(options.actor, DEFAULT_CLIENT_CREDENTIALS_ACTOR);
      const scopes = parseScopesOption(options.scopes);
      const session = await ensureFreshClientCredentialsSession({
        actor,
        clientId,
        clientSecret,
        profileName,
        scopes,
        tokenStore,
      });

      await saveProfileAuthMode(config, profileName, "clientCredentials");
      writeUtilityOutput(
        invokedCommand,
        {
          actor,
          authMode: "clientCredentials",
          authenticated: true,
          clientId,
          expiresAt: session.expiresAt,
          profileName,
          scopes: session.scopes,
          source: "login-client-credentials",
        },
        `Stored client-credentials session for profile "${profileName}".`,
      );
    });
}

function registerLogoutCommand(command: Command): void {
  command
    .command("logout")
    .description("Clear stored credentials for the selected profile.")
    .action(async (_options, invokedCommand: Command) => {
      const profileName = await resolveProfileName(invokedCommand);
      const tokenStore = await createCliTokenStore();

      await tokenStore.clearProfileSecrets(profileName);
      writeUtilityOutput(
        invokedCommand,
        {
          authenticated: false,
          profileName,
          source: "logout",
        },
        `Cleared stored credentials for profile "${profileName}".`,
      );
    });
}

function registerStatusCommand(command: Command): void {
  command
    .command("status")
    .description("Show the stored authentication state for the selected profile.")
    .action(async (_options, invokedCommand: Command) => {
      const profileName = await resolveProfileName(invokedCommand);
      const tokenStore = await createCliTokenStore();
      const config = await loadConfigFile();
      const secrets = await tokenStore.getProfileSecrets(profileName);
      const report = buildAuthStatusReport({
        config,
        profileName,
        secrets,
      });

      writeUtilityOutput(invokedCommand, report, formatAuthStatusReport(report));
    });
}

function registerProfilesCommand(command: Command): void {
  const profilesCommand = command.command("profiles").description("Manage CLI profiles.");

  profilesCommand
    .command("list")
    .description("List configured CLI profiles.")
    .action(async (_options, invokedCommand: Command) => {
      const config = await loadConfigFile();
      const report = buildProfilesListReport(config);

      writeUtilityOutput(invokedCommand, report, formatProfilesListReport(report));
    });

  profilesCommand
    .command("use")
    .description("Set the default CLI profile.")
    .argument("<name>", "the profile name to mark as default")
    .action(async (profileName: string, invokedCommand: Command) => {
      const config = await loadConfigFile();

      if (!config.profiles[profileName]) {
        throw new CliError(
          `Profile "${profileName}" does not exist.`,
          EXIT_CODES.authOrConfigFailure,
        );
      }

      await saveConfigFile(setDefaultProfile(config, profileName));
      writeUtilityOutput(
        invokedCommand,
        {
          defaultProfile: profileName,
          profiles: listProfiles(config),
        },
        `Default profile is now "${profileName}".`,
      );
    });
}

async function saveProfileAuthMode(
  config: LinearConfig,
  profileName: string,
  authMode: AuthMode,
): Promise<void> {
  await saveConfigFile(
    upsertProfile(config, profileName, {
      authMode,
    }),
  );
}

async function resolveProfileName(command: Command): Promise<string> {
  const runtimeContext = createRuntimeContext(command);
  const config = await loadConfigFile();

  return runtimeContext.globalOptions.profile ?? config.defaultProfile ?? DEFAULT_PROFILE_NAME;
}

async function createCliTokenStore() {
  return createTokenStore({
    allowPlaintextFallback: allowPlaintextFallback(),
  });
}

function allowPlaintextFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(env.LINEAR_ALLOW_PLAINTEXT_CREDENTIALS ?? "").toLowerCase(),
  );
}

function parseCsvOption(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseScopesOption(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry)).filter(Boolean)
    : [];
}

function parseActorOption(value: unknown, fallback: OAuthActor): OAuthActor {
  if (value === "app" || value === "user") {
    return value;
  }

  return fallback;
}

function parseOptionalPort(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("Redirect port must be a positive integer.", EXIT_CODES.validationFailure);
  }

  return parsed;
}

function requiredStringOption(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliError(`A ${label} is required.`, EXIT_CODES.validationFailure);
  }

  return value.trim();
}

function writeUtilityOutput(command: Command, value: unknown, message: string): void {
  const runtimeContext = createRuntimeContext(command);

  if (runtimeContext.globalOptions.format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(message);
}
