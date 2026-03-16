import type { FetchLike } from "../auth/oauth-auth.js";
import type { OperationRegistryEntry } from "../registry/types.js";
import { executeGraphQLRequest, type GraphQLResponseEnvelope } from "./client.js";
import { buildCanonicalOperationDocument } from "./document-builder.js";
import { assertGraphQLSuccess } from "./errors.js";

export interface ExecuteGraphQLBaseInput {
  allowPartialData?: boolean;
  authorization?: string | null;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
  publicFileUrlsExpireIn?: number | null;
  variables?: Record<string, unknown>;
}

export async function executeCanonicalGraphQLOperation<TData>(
  entry: OperationRegistryEntry,
  input: ExecuteGraphQLBaseInput & {
    selectionOverride?: string | null;
  },
): Promise<GraphQLResponseEnvelope<TData>> {
  const document = buildCanonicalOperationDocument(entry, {
    selectionOverride: input.selectionOverride,
  });
  const envelope = await executeGraphQLRequest<TData>({
    authorization: input.authorization,
    baseUrl: input.baseUrl,
    extraHeaders: input.extraHeaders,
    fetchImpl: input.fetchImpl,
    payload: {
      operationName: document.operationName,
      query: document.query,
      variables: input.variables,
    },
    publicFileUrlsExpireIn: input.publicFileUrlsExpireIn,
  });

  return assertGraphQLSuccess(envelope, {
    allowPartialData: input.allowPartialData,
  });
}

export async function executeRawGraphQL<TData>(
  input: ExecuteGraphQLBaseInput & {
    operationName?: string;
    query: string;
  },
): Promise<GraphQLResponseEnvelope<TData>> {
  const envelope = await executeGraphQLRequest<TData>({
    authorization: input.authorization,
    baseUrl: input.baseUrl,
    extraHeaders: input.extraHeaders,
    fetchImpl: input.fetchImpl,
    payload: {
      operationName: input.operationName,
      query: input.query,
      variables: input.variables,
    },
    publicFileUrlsExpireIn: input.publicFileUrlsExpireIn,
  });

  return assertGraphQLSuccess(envelope, {
    allowPartialData: input.allowPartialData,
  });
}

