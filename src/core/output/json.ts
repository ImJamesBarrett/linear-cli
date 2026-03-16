import { extractConnectionPage, isConnectionOperation } from "../graphql/pagination/connection.js";
import type { OperationRegistryEntry } from "../registry/types.js";
import type { CommandExecutionEnvelope } from "./types.js";

export interface JsonOutputEnvelope {
  data: unknown;
  errors: unknown[];
  headers?: Record<string, string>;
  pageInfo?: {
    endCursor: string | null;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
  pagination?: {
    mode: "all";
    nodesFetched: number;
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor: string | null;
    };
    pagesFetched: number;
    totalCount: number | null;
  };
  rateLimit?: unknown;
}

export function buildJsonOutput(
  entry: OperationRegistryEntry,
  envelope: CommandExecutionEnvelope,
  options: {
    verbose: boolean;
  },
): JsonOutputEnvelope {
  const result: JsonOutputEnvelope = {
    data: envelope.data,
    errors: envelope.errors,
  };

  if (envelope.data && isConnectionOperation(entry)) {
    result.pageInfo = extractConnectionPage(entry, envelope.data).pageInfo;
  }

  if (options.verbose) {
    result.headers = envelope.headers;
    result.rateLimit = envelope.rateLimit;

    if (envelope.pagination) {
      result.pagination = envelope.pagination;
    }
  }

  return result;
}

export function writeJsonOutput(
  entry: OperationRegistryEntry,
  envelope: CommandExecutionEnvelope,
  options: {
    verbose: boolean;
  },
): void {
  console.log(JSON.stringify(buildJsonOutput(entry, envelope, options), null, 2));
}
