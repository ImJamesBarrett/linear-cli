import { connectionRegistry } from "../../../generated/connection-registry.js";
import type {
  ConnectionRegistryEntry,
  GraphQLTypeRef,
  OperationRegistryEntry,
} from "../../registry/types.js";
import { CliError, EXIT_CODES } from "../../runtime/exit-codes.js";

const DEFAULT_FORWARD_PAGE_SIZE = 50;

export interface ConnectionPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface ExtractedConnectionPage<TNode = unknown> {
  connection: ConnectionRegistryEntry;
  fieldName: string;
  nodes: TNode[];
  pageInfo: ConnectionPageInfo;
  totalCount: number | null;
}

export function findConnectionEntry(
  entry: OperationRegistryEntry,
): ConnectionRegistryEntry | null {
  const returnTypeName = unwrapNamedType(entry.returnType);

  if (!returnTypeName) {
    return null;
  }

  return (
    connectionRegistry.entries.find(
      (connectionEntry) => connectionEntry.connectionType === returnTypeName,
    ) ?? null
  );
}

export function isConnectionOperation(entry: OperationRegistryEntry): boolean {
  return findConnectionEntry(entry) !== null;
}

export function extractConnectionPage<TNode = unknown>(
  entry: OperationRegistryEntry,
  data: unknown,
): ExtractedConnectionPage<TNode> {
  const connectionEntry = findConnectionEntry(entry);

  if (!connectionEntry) {
    throw new CliError(
      `Operation ${entry.cliCommand} ${entry.cliSubcommand} does not return a connection.`,
      EXIT_CODES.runtimeFailure,
    );
  }

  const root = asRecord(
    data,
    `Expected GraphQL data for ${entry.cliCommand} ${entry.cliSubcommand}.`,
  );
  const connectionValue = asRecord(
    root[entry.graphqlName],
    `Expected the "${entry.graphqlName}" field to contain a connection result.`,
  );
  const pageInfoKey = connectionEntry.pageInfoFieldName ?? "pageInfo";
  const pageInfo = normalizePageInfo(
    connectionValue[pageInfoKey],
    `Expected the "${pageInfoKey}" field on "${entry.graphqlName}" to contain page information.`,
  );
  const rawNodes = connectionValue.nodes;
  const totalCountValue = connectionEntry.totalCountFieldName
    ? connectionValue[connectionEntry.totalCountFieldName]
    : undefined;

  return {
    connection: connectionEntry,
    fieldName: entry.graphqlName,
    nodes: Array.isArray(rawNodes) ? (rawNodes as TNode[]) : [],
    pageInfo,
    totalCount: typeof totalCountValue === "number" ? totalCountValue : null,
  };
}

export function createNextForwardPaginationVariables(
  variables: Record<string, unknown>,
  page: Pick<ExtractedConnectionPage, "pageInfo">,
): Record<string, unknown> {
  return {
    ...variables,
    after: page.pageInfo.endCursor,
    before: undefined,
    first: resolveForwardPageSize(variables),
    last: undefined,
  };
}

export function resolveForwardPageSize(variables: Record<string, unknown>): number {
  const first = variables.first;

  if (typeof first === "number" && Number.isFinite(first) && first > 0) {
    return first;
  }

  return DEFAULT_FORWARD_PAGE_SIZE;
}

function unwrapNamedType(typeRef: GraphQLTypeRef): string | null {
  return typeRef.kind === "NAMED"
    ? typeRef.name
    : typeRef.ofType
      ? unwrapNamedType(typeRef.ofType)
      : null;
}

function normalizePageInfo(
  value: unknown,
  message: string,
): ConnectionPageInfo {
  const pageInfo = asRecord(value, message);

  return {
    endCursor: typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null,
    hasNextPage: pageInfo.hasNextPage === true,
    hasPreviousPage: pageInfo.hasPreviousPage === true,
    startCursor: typeof pageInfo.startCursor === "string" ? pageInfo.startCursor : null,
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError(message, EXIT_CODES.runtimeFailure);
  }

  return value as Record<string, unknown>;
}
