import type { ExecuteGraphQLBaseInput } from "../execute.js";
import { executeCanonicalGraphQLOperation } from "../execute.js";
import type { GraphQLResponseEnvelope } from "../client.js";
import type { OperationRegistryEntry } from "../../registry/types.js";
import { CliError, EXIT_CODES } from "../../runtime/exit-codes.js";
import {
  createInitialForwardPaginationVariables,
  createNextForwardPaginationVariables,
  extractConnectionPage,
  type ConnectionPageInfo,
} from "./connection.js";

export interface PaginationMetadata {
  mode: "all";
  nodesFetched: number;
  pageInfo: ConnectionPageInfo;
  pagesFetched: number;
  totalCount: number | null;
}

export interface PaginatedGraphQLResponseEnvelope<TData> extends GraphQLResponseEnvelope<TData> {
  pagination: PaginationMetadata | null;
}

export async function executeAllConnectionPages<TData extends Record<string, unknown>>(
  entry: OperationRegistryEntry,
  input: ExecuteGraphQLBaseInput & {
    selectionOverride?: string | null;
  },
): Promise<PaginatedGraphQLResponseEnvelope<TData>> {
  let variables = createInitialForwardPaginationVariables(input.variables ?? {});
  let finalEnvelope: GraphQLResponseEnvelope<TData> | null = null;
  const aggregatedNodes: unknown[] = [];
  let finalPageInfo: ConnectionPageInfo | null = null;
  let totalCount: number | null = null;
  let pagesFetched = 0;
  let nodesFetched = 0;

  while (true) {
    const envelope = await executeCanonicalGraphQLOperation<TData>(entry, {
      ...input,
      variables,
    });
    const page = extractConnectionPage(entry, envelope.data);

    finalEnvelope = envelope;
    aggregatedNodes.push(...page.nodes);
    finalPageInfo = page.pageInfo;
    totalCount = page.totalCount ?? totalCount;
    pagesFetched += 1;
    nodesFetched += page.nodes.length;

    if (!page.pageInfo.hasNextPage) {
      break;
    }

    if (!page.pageInfo.endCursor) {
      throw new CliError(
        `Expected an end cursor while paginating ${entry.cliCommand} ${entry.cliSubcommand}.`,
        EXIT_CODES.runtimeFailure,
      );
    }

    variables = createNextForwardPaginationVariables(variables, page);
  }

  if (!finalEnvelope?.data || !finalPageInfo) {
    throw new CliError(
      `Expected paginated data for ${entry.cliCommand} ${entry.cliSubcommand}.`,
      EXIT_CODES.runtimeFailure,
    );
  }

  return {
    ...finalEnvelope,
    data: mergeAggregatedConnectionData(entry, finalEnvelope.data, aggregatedNodes, finalPageInfo, totalCount),
    pagination: {
      mode: "all",
      nodesFetched,
      pageInfo: finalPageInfo,
      pagesFetched,
      totalCount,
    },
  };
}

function mergeAggregatedConnectionData<TData extends Record<string, unknown>>(
  entry: OperationRegistryEntry,
  data: TData,
  nodes: unknown[],
  pageInfo: ConnectionPageInfo,
  totalCount: number | null,
): TData {
  const root = asRecord(
    data,
    `Expected GraphQL data for ${entry.cliCommand} ${entry.cliSubcommand}.`,
  );
  const connection = asRecord(
    root[entry.graphqlName],
    `Expected the "${entry.graphqlName}" field to contain a connection result.`,
  );

  return {
    ...root,
    [entry.graphqlName]: {
      ...connection,
      nodes,
      pageInfo,
      ...(totalCount === null ? {} : { totalCount }),
    },
  } as TData;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError(message, EXIT_CODES.runtimeFailure);
  }

  return value as Record<string, unknown>;
}
