#!/usr/bin/env node

import { createProgram } from "../cli/program.js";
import { formatErrorMessage, resolveExitCode } from "../core/runtime/exit-codes.js";

try {
  const program = createProgram();
  await program.parseAsync(process.argv);
} catch (error) {
  const message = formatErrorMessage(error);

  if (message) {
    console.error(message);
  }

  process.exitCode = resolveExitCode(error);
}
