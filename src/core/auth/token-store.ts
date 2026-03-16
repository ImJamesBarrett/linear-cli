import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import { getConfigPaths } from "../config/config-schema.js";

const KEYTAR_SERVICE_NAME = "linear-cli";

export type SecretValue = string | null;

export interface StoredProfileSecrets {
  accessToken?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: string;
  refreshToken?: string;
}

export interface PlaintextCredentialsFile {
  profiles: Record<string, StoredProfileSecrets>;
}

export interface TokenStoreOptions {
  allowPlaintextFallback?: boolean;
  credentialsFilePath?: string;
  loadKeytar?: () => Promise<KeytarModule>;
}

export interface TokenStore {
  clearProfileSecrets(profileName: string): Promise<void>;
  getProfileSecrets(profileName: string): Promise<StoredProfileSecrets>;
  setProfileSecrets(profileName: string, secrets: StoredProfileSecrets): Promise<void>;
}

export interface KeytarModule {
  deletePassword(service: string, account: string): Promise<boolean>;
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

export async function createTokenStore(options: TokenStoreOptions = {}): Promise<TokenStore> {
  const credentialsFilePath =
    options.credentialsFilePath ?? getConfigPaths().credentialsFile;
  const loadKeytar = options.loadKeytar ?? defaultLoadKeytar;

  try {
    const keytar = await loadKeytar();
    return createKeytarTokenStore(keytar);
  } catch (error) {
    if (!options.allowPlaintextFallback) {
      throw new CliError(
        `Secure credential storage is unavailable and plaintext fallback is disabled: ${formatCause(error)}`,
        EXIT_CODES.authOrConfigFailure,
        { cause: error },
      );
    }

    return createPlaintextTokenStore(credentialsFilePath);
  }
}

export function createKeytarTokenStore(keytar: KeytarModule): TokenStore {
  return {
    async clearProfileSecrets(profileName) {
      await keytar.deletePassword(KEYTAR_SERVICE_NAME, profileName);
    },
    async getProfileSecrets(profileName) {
      const raw = await keytar.getPassword(KEYTAR_SERVICE_NAME, profileName);

      if (!raw) {
        return {};
      }

      return parseStoredSecrets(raw, `keychain profile "${profileName}"`);
    },
    async setProfileSecrets(profileName, secrets) {
      await keytar.setPassword(
        KEYTAR_SERVICE_NAME,
        profileName,
        JSON.stringify(sanitizeSecrets(secrets)),
      );
    },
  };
}

export function createPlaintextTokenStore(credentialsFilePath: string): TokenStore {
  return {
    async clearProfileSecrets(profileName) {
      const file = await loadPlaintextCredentialsFile(credentialsFilePath);
      delete file.profiles[profileName];
      await persistPlaintextCredentialsFile(credentialsFilePath, file);

      if (Object.keys(file.profiles).length === 0) {
        await rm(credentialsFilePath, { force: true });
      }
    },
    async getProfileSecrets(profileName) {
      const file = await loadPlaintextCredentialsFile(credentialsFilePath);
      return file.profiles[profileName] ?? {};
    },
    async setProfileSecrets(profileName, secrets) {
      const file = await loadPlaintextCredentialsFile(credentialsFilePath);
      file.profiles[profileName] = sanitizeSecrets(secrets);
      await persistPlaintextCredentialsFile(credentialsFilePath, file);
    },
  };
}

async function loadPlaintextCredentialsFile(
  credentialsFilePath: string,
): Promise<PlaintextCredentialsFile> {
  try {
    const raw = await readFile(credentialsFilePath, "utf8");
    const parsed = JSON.parse(raw) as PlaintextCredentialsFile;

    return {
      profiles: parsed.profiles ?? {},
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return { profiles: {} };
    }

    if (error instanceof SyntaxError) {
      throw new CliError(
        `Invalid plaintext credentials file at ${credentialsFilePath}: ${error.message}`,
        EXIT_CODES.authOrConfigFailure,
        { cause: error },
      );
    }

    throw error;
  }
}

async function persistPlaintextCredentialsFile(
  credentialsFilePath: string,
  file: PlaintextCredentialsFile,
): Promise<void> {
  await mkdir(path.dirname(credentialsFilePath), { recursive: true });
  await writeFile(
    credentialsFilePath,
    `${JSON.stringify({ profiles: file.profiles }, null, 2)}\n`,
    "utf8",
  );
}

function sanitizeSecrets(secrets: StoredProfileSecrets): StoredProfileSecrets {
  return Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => value !== undefined && value !== null),
  ) as StoredProfileSecrets;
}

function parseStoredSecrets(raw: string, sourceLabel: string): StoredProfileSecrets {
  try {
    const parsed = JSON.parse(raw) as StoredProfileSecrets;
    return sanitizeSecrets(parsed);
  } catch (error) {
    throw new CliError(
      `Invalid stored credentials in ${sourceLabel}.`,
      EXIT_CODES.authOrConfigFailure,
      { cause: error },
    );
  }
}

async function defaultLoadKeytar(): Promise<KeytarModule> {
  const imported = await import("keytar");
  return imported.default ?? imported;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}
