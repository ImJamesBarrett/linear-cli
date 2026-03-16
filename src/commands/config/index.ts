import { Command } from "commander";

export function createConfigCommand(): Command {
  return new Command("config").description("Manage CLI configuration and profile defaults.");
}

