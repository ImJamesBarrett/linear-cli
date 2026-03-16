import { Command } from "commander";

import { registerGlobalOptions } from "./global-options.js";
import { configureHelp } from "./help.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("linear")
    .description("Schema-driven CLI wrapper for the Linear GraphQL API.")
    .showHelpAfterError("(run with --help for usage)");

  registerGlobalOptions(program);
  configureHelp(program);

  return program;
}

