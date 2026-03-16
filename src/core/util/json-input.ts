import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import { readTextFile } from "./fs.js";

export async function loadTextInput(
  value: string,
  options: {
    cwd?: string;
    label?: string;
  } = {},
): Promise<string> {
  if (!value.startsWith("@")) {
    return value;
  }

  const filePath = value.slice(1);

  if (!filePath) {
    throw new CliError(
      `Invalid ${options.label ?? "input"} reference "@". Expected @path.`,
      EXIT_CODES.validationFailure,
    );
  }

  return readTextFile(filePath, {
    cwd: options.cwd,
    label: options.label ?? "input file",
  });
}

export async function loadJsonInput<TValue = unknown>(
  value: string,
  options: {
    cwd?: string;
    label?: string;
  } = {},
): Promise<TValue> {
  const text = await loadTextInput(value, options);

  try {
    return JSON.parse(text) as TValue;
  } catch (error) {
    throw new CliError(
      `Invalid ${options.label ?? "JSON input"}: ${formatCause(error)}`,
      EXIT_CODES.validationFailure,
      { cause: error },
    );
  }
}

export async function loadOptionalJsonInput<TValue = unknown>(
  value: string | null | undefined,
  options: {
    cwd?: string;
    label?: string;
  } = {},
): Promise<TValue | null> {
  if (!value) {
    return null;
  }

  return loadJsonInput<TValue>(value, options);
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}

