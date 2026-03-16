import type { Command } from "commander";

import type { RuntimeContext } from "../../types/cli.js";
import { normalizeGlobalOptions } from "./globals.js";

export function createRuntimeContext(command: Command): RuntimeContext {
  return {
    cwd: process.cwd(),
    globalOptions: normalizeGlobalOptions(command.optsWithGlobals<Record<string, unknown>>()),
    startedAt: new Date(),
  };
}

