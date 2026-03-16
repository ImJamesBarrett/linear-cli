import { Command } from "commander";

import { loadConfigFile } from "../../core/config/load-config.js";
import { saveConfigFile } from "../../core/config/persist-config.js";
import { createRuntimeContext } from "../../core/runtime/context.js";
import { CliError, EXIT_CODES } from "../../core/runtime/exit-codes.js";
import {
  getConfigValue,
  listConfigValues,
  setConfigValue,
  unsetConfigValue,
} from "./keys.js";

export function createConfigCommand(): Command {
  const command = new Command("config").description(
    "Manage CLI configuration and profile defaults.",
  );

  command.option("--json", "emit JSON output for config commands");

  command
    .command("get")
    .description("Read a config value.")
    .argument("<key>", "the config key to read")
    .action(async (key: string, invokedCommand: Command) => {
      const config = await loadConfigFile();
      const profileName = await resolveProfileName(invokedCommand);
      const value = getConfigValue(config, key, shouldUseProfileScope(key) ? profileName : null);

      writeConfigOutput(invokedCommand, value, `${key}=${String(value)}`);
    });

  command
    .command("set")
    .description("Update a config value.")
    .argument("<key>", "the config key to update")
    .argument("<value>", "the value to write")
    .action(async (key: string, value: string, invokedCommand: Command) => {
      const config = await loadConfigFile();
      const profileName = await resolveProfileName(invokedCommand);
      const nextConfig = setConfigValue(
        config,
        key,
        value,
        shouldUseProfileScope(key) ? profileName : null,
      );

      await saveConfigFile(nextConfig);
      writeConfigOutput(invokedCommand, { key, value }, `Set ${key}.`);
    });

  command
    .command("unset")
    .description("Reset a config value to its default.")
    .argument("<key>", "the config key to reset")
    .action(async (key: string, invokedCommand: Command) => {
      const config = await loadConfigFile();
      const profileName = await resolveProfileName(invokedCommand);
      const nextConfig = unsetConfigValue(
        config,
        key,
        shouldUseProfileScope(key) ? profileName : null,
      );

      await saveConfigFile(nextConfig);
      writeConfigOutput(invokedCommand, { key, unset: true }, `Unset ${key}.`);
    });

  command
    .command("list")
    .description("List config values.")
    .action(async (_options, invokedCommand: Command) => {
      const config = await loadConfigFile();
      const profileName = await resolveProfileName(invokedCommand);
      const value = listConfigValues(
        config,
        runtimeWantsProfileScope(invokedCommand) ? profileName : null,
      );

      writeConfigOutput(invokedCommand, value, JSON.stringify(value, null, 2));
    });

  return command;
}

async function resolveProfileName(command: Command): Promise<string> {
  const runtimeContext = createRuntimeContext(command);
  const config = await loadConfigFile();

  return runtimeContext.globalOptions.profile ?? config.defaultProfile;
}

function runtimeWantsProfileScope(command: Command): boolean {
  return createRuntimeContext(command).globalOptions.profile !== null;
}

function shouldUseProfileScope(key: string): boolean {
  return key !== "defaultProfile";
}

function writeConfigOutput(command: Command, value: unknown, message: string): void {
  const runtimeContext = createRuntimeContext(command);
  const jsonMode = runtimeContext.globalOptions.format === "json" || command.optsWithGlobals<Record<string, unknown>>().json === true;

  if (jsonMode) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(message);
}
