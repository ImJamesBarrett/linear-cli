import {
  DEFAULT_PROFILE_NAME,
  profileConfigSchema,
  type LinearConfig,
  type ProfileConfig,
} from "./config-schema.js";
import { ensureProfileExists } from "./persist-config.js";

export function listProfiles(config: LinearConfig): string[] {
  return Object.keys(config.profiles).sort((left, right) => left.localeCompare(right));
}

export function getProfile(config: LinearConfig, profileName: string): ProfileConfig {
  ensureProfileExists(config, profileName);
  return config.profiles[profileName];
}

export function setDefaultProfile(config: LinearConfig, profileName: string): LinearConfig {
  ensureProfileExists(config, profileName);

  return {
    ...config,
    defaultProfile: profileName,
  };
}

export function upsertProfile(
  config: LinearConfig,
  profileName: string,
  updates: Partial<ProfileConfig>,
): LinearConfig {
  const currentProfile = config.profiles[profileName] ?? profileConfigSchema.parse({});
  const nextProfile = profileConfigSchema.parse({
    ...currentProfile,
    ...updates,
  });

  return {
    ...config,
    profiles: {
      ...config.profiles,
      [profileName]: nextProfile,
    },
  };
}

export function removeProfile(config: LinearConfig, profileName: string): LinearConfig {
  ensureProfileExists(config, profileName);

  const remainingProfiles = { ...config.profiles };
  delete remainingProfiles[profileName];

  if (Object.keys(remainingProfiles).length === 0) {
    remainingProfiles[DEFAULT_PROFILE_NAME] = profileConfigSchema.parse({});
  }

  const nextDefaultProfile =
    config.defaultProfile === profileName
      ? Object.keys(remainingProfiles).sort((left, right) => left.localeCompare(right))[0]!
      : config.defaultProfile;

  return {
    ...config,
    defaultProfile: nextDefaultProfile,
    profiles: remainingProfiles,
  };
}

