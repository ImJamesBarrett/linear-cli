#!/usr/bin/env node

import { createProgram } from "../cli/program.js";
import { formatErrorMessage, resolveExitCode } from "../core/runtime/exit-codes.js";
import { buildJsonErrorOutput, resolveErrorOutputFormat } from "../core/runtime/error-output.js";

const outputFormat = await resolveErrorOutputFormat(process.argv.slice(2));

try {
  const program = createProgram();

  if (outputFormat === "json") {
    program.configureOutput({
      outputError: () => undefined,
      writeErr: () => undefined,
    });
  }

  await program.parseAsync(process.argv);
} catch (error) {
  if (outputFormat === "json") {
    const payload = buildJsonErrorOutput(error);

    if (payload) {
      console.error(JSON.stringify(payload, null, 2));
    }
  } else {
    const message = formatErrorMessage(error);

    if (message) {
      console.error(message);
    }
  }

  process.exitCode = resolveExitCode(error);
}
