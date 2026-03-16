import { Command } from "commander";

export function createAuthCommand(): Command {
  return new Command("auth").description(
    "Authenticate the CLI using personal API key, OAuth2, or client credentials.",
  );
}

