export const EXIT_CODES = {
  success: 0,
  runtimeFailure: 1,
  authOrConfigFailure: 2,
  graphqlFailure: 3,
  rateLimited: 4,
  validationFailure: 5,
  partialDataFailure: 6,
  interrupted: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function resolveExitCode(error: unknown): ExitCode {
  if (error instanceof CliError) {
    return error.exitCode;
  }

  if (isCommanderHelp(error)) {
    return EXIT_CODES.success;
  }

  if (isCommanderError(error)) {
    return EXIT_CODES.validationFailure;
  }

  return EXIT_CODES.runtimeFailure;
}

export function formatErrorMessage(error: unknown): string | null {
  if (isCommanderHelp(error)) {
    return null;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

function isCommanderError(error: unknown): error is { code?: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    "code" in error
  );
}

function isCommanderHelp(error: unknown): boolean {
  return isCommanderError(error) && error.code === "commander.helpDisplayed";
}

