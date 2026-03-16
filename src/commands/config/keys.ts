import {
  DEFAULT_PROFILE_NAME,
  profileConfigSchema,
  type AuthMode,
  type LinearConfig,
  type ProfileConfig,
} from "../../core/config/config-schema.js";
import { ensureProfileExists } from "../../core/config/persist-config.js";
import { upsertProfile } from "../../core/config/profiles.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";

export function getConfigValue(
  config: LinearConfig,
  key: string,
  profileName: string | null,
): unknown {
  if (key === "defaultProfile") {
    return config.defaultProfile;
  }

  const profile = getTargetProfile(config, profileName);

  if (key.startsWith("headers.")) {
    return profile.headers[key.slice("headers.".length)] ?? null;
  }

  if (key in profile) {
    return profile[key as keyof ProfileConfig];
  }

  throw unknownConfigKey(key);
}

export function setConfigValue(
  config: LinearConfig,
  key: string,
  rawValue: string,
  profileName: string | null,
): LinearConfig {
  if (key === "defaultProfile") {
    return {
      ...config,
      defaultProfile: rawValue.trim() || DEFAULT_PROFILE_NAME,
    };
  }

  const targetProfileName = profileName ?? config.defaultProfile ?? DEFAULT_PROFILE_NAME;

  if (key.startsWith("headers.")) {
    const headerName = key.slice("headers.".length).trim();

    if (!headerName) {
      throw unknownConfigKey(key);
    }

    const current = config.profiles[targetProfileName] ?? profileConfigSchema.parse({});

    return upsertProfile(config, targetProfileName, {
      headers: {
        ...current.headers,
        [headerName]: rawValue,
      },
    });
  }

  switch (key) {
    case "authMode":
      return upsertProfile(config, targetProfileName, {
        authMode: parseAuthModeValue(rawValue),
      });
    case "baseUrl":
      return upsertProfile(config, targetProfileName, {
        baseUrl: rawValue,
      });
    case "format":
      return upsertProfile(config, targetProfileName, {
        format: parseFormatValue(rawValue),
      });
    case "publicFileUrlsExpireIn":
      return upsertProfile(config, targetProfileName, {
        publicFileUrlsExpireIn: parseNullableIntegerValue(rawValue),
      });
    default:
      throw unknownConfigKey(key);
  }
}

export function unsetConfigValue(
  config: LinearConfig,
  key: string,
  profileName: string | null,
): LinearConfig {
  if (key === "defaultProfile") {
    return {
      ...config,
      defaultProfile: DEFAULT_PROFILE_NAME,
    };
  }

  const targetProfileName = profileName ?? config.defaultProfile ?? DEFAULT_PROFILE_NAME;
  const current = getTargetProfile(config, targetProfileName);
  const defaults = profileConfigSchema.parse({});

  if (key.startsWith("headers.")) {
    const headerName = key.slice("headers.".length).trim();

    if (!headerName) {
      throw unknownConfigKey(key);
    }

    const nextHeaders = { ...current.headers };
    delete nextHeaders[headerName];

    return upsertProfile(config, targetProfileName, {
      headers: nextHeaders,
    });
  }

  switch (key) {
    case "authMode":
      return upsertProfile(config, targetProfileName, {
        authMode: defaults.authMode,
      });
    case "baseUrl":
      return upsertProfile(config, targetProfileName, {
        baseUrl: defaults.baseUrl,
      });
    case "format":
      return upsertProfile(config, targetProfileName, {
        format: defaults.format,
      });
    case "publicFileUrlsExpireIn":
      return upsertProfile(config, targetProfileName, {
        publicFileUrlsExpireIn: defaults.publicFileUrlsExpireIn,
      });
    default:
      throw unknownConfigKey(key);
  }
}

export function listConfigValues(
  config: LinearConfig,
  profileName: string | null,
): Record<string, unknown> {
  if (!profileName) {
    return config;
  }

  return {
    defaultProfile: config.defaultProfile,
    profile: {
      name: profileName,
      ...getTargetProfile(config, profileName),
    },
  };
}

function getTargetProfile(config: LinearConfig, profileName: string | null): ProfileConfig {
  const resolvedProfileName = profileName ?? config.defaultProfile ?? DEFAULT_PROFILE_NAME;
  ensureProfileExists(config, resolvedProfileName);
  return config.profiles[resolvedProfileName];
}

function parseAuthModeValue(value: string): AuthMode | null {
  if (value === "null") {
    return null;
  }

  if (value === "apiKey" || value === "clientCredentials" || value === "oauth") {
    return value;
  }

  throw new CliError(
    `Invalid authMode value "${value}".`,
    EXIT_CODES.validationFailure,
  );
}

function parseFormatValue(value: string): "human" | "json" {
  if (value === "human" || value === "json") {
    return value;
  }

  throw new CliError(
    `Invalid format value "${value}".`,
    EXIT_CODES.validationFailure,
  );
}

function parseNullableIntegerValue(value: string): number | null {
  if (value === "null") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(
      `Invalid integer value "${value}".`,
      EXIT_CODES.validationFailure,
    );
  }

  return parsed;
}

function unknownConfigKey(key: string): CliError {
  return new CliError(
    `Unknown config key "${key}".`,
    EXIT_CODES.validationFailure,
  );
}
