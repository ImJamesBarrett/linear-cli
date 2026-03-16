import type { OperationRegistryEntry } from "../../registry/types.js";
import { CliError, EXIT_CODES } from "../../runtime/exit-codes.js";

export interface PaginationInvocation {
  all: boolean;
  after?: unknown;
  before?: unknown;
  first?: unknown;
  last?: unknown;
}

export function supportsAllPagination(entry: OperationRegistryEntry): boolean {
  return entry.kind === "query" && entry.defaultSelectionStrategy === "connection";
}

export function validatePaginationInvocation(
  entry: OperationRegistryEntry,
  invocation: PaginationInvocation,
): void {
  const hasAfter = invocation.after !== undefined;
  const hasBefore = invocation.before !== undefined;
  const hasFirst = invocation.first !== undefined;
  const hasLast = invocation.last !== undefined;

  if (hasFirst && hasLast) {
    throw new CliError(
      `Cannot combine --first with --last for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.validationFailure,
    );
  }

  if (hasAfter && hasBefore) {
    throw new CliError(
      `Cannot combine --after with --before for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.validationFailure,
    );
  }

  if (hasAfter && hasLast) {
    throw new CliError(
      `Cannot combine --after with --last for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.validationFailure,
    );
  }

  if (hasBefore && hasFirst) {
    throw new CliError(
      `Cannot combine --before with --first for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.validationFailure,
    );
  }

  if (invocation.all && (hasBefore || hasLast)) {
    throw new CliError(
      `Cannot combine --all with backward pagination flags for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.validationFailure,
    );
  }
}
