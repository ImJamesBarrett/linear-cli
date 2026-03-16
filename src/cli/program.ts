import { Command } from "commander";

import { createAuthCommand } from "../commands/auth/index.js";
import { createConfigCommand } from "../commands/config/index.js";
import { createGraphqlCommand } from "../commands/graphql/index.js";
import { createMutationCommand } from "../commands/mutation/index.js";
import { createQueryCommand } from "../commands/query/index.js";
import { createUploadCommand } from "../commands/upload/index.js";
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
  program.addCommand(createAuthCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createMutationCommand());
  program.addCommand(createGraphqlCommand());
  program.addCommand(createUploadCommand());
  program.configureOutput({
    outputError: (text, write) => write(text),
  });

  program.action(() => {
    program.outputHelp();
    process.exitCode = EXIT_CODES.success;
  });

  return program;
}
