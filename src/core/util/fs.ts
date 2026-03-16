import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";

export async function readTextFile(
  filePath: string,
  options: {
    cwd?: string;
    label?: string;
  } = {},
): Promise<string> {
  const resolvedPath = resolveInputPath(filePath, options.cwd);

  try {
    return await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new CliError(
      `Failed to read ${options.label ?? "file"} at ${resolvedPath}: ${formatCause(error)}`,
      EXIT_CODES.validationFailure,
      { cause: error },
    );
  }
}

export function resolveInputPath(filePath: string, cwd = process.cwd()): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}

