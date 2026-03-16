import { Command } from "commander";

import { registerGlobalOptions } from "./global-options.js";
import { configureHelp } from "./help.js";
import { EXIT_CODES } from "../core/runtime/exit-codes.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("linear")
    .description("Schema-driven CLI wrapper for the Linear GraphQL API.")
    .showHelpAfterError("(run with --help for usage)")
    .exitOverride();

  registerGlobalOptions(program);
  configureHelp(program);
  program.configureOutput({
    outputError: (text, write) => write(text),
  });

  program.action(() => {
    program.outputHelp();
    process.exitCode = EXIT_CODES.success;
  });

  return program;
}
