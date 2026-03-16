import { fetch } from "undici";

import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";
import type { FetchLike, OAuthHttpResponse } from "../auth/oauth-auth.js";

export interface GraphQLRequestPayload {
  operationName?: string;
  query: string;
  variables?: Record<string, unknown>;
}

export interface GraphQLErrorLike {
  extensions?: Record<string, unknown>;
  locations?: Array<{ column: number; line: number }>;
  message: string;
  path?: Array<string | number>;
}

export interface RateLimitMetadata {
  complexityLimit: number | null;
  complexityRemaining: number | null;
  complexityReset: string | null;
  complexityUsed: number | null;
  endpointName: string | null;
  endpointRequestsLimit: number | null;
  endpointRequestsRemaining: number | null;
  endpointRequestsReset: string | null;
  requestsLimit: number | null;
  requestsRemaining: number | null;
  requestsReset: string | null;
}

export interface GraphQLResponseEnvelope<TData> {
  data: TData | null;
  errors: GraphQLErrorLike[];
  headers: Record<string, string>;
  rateLimit: RateLimitMetadata;
  status: number;
}

export interface ExecuteGraphQLRequestInput {
  authorization?: string | null;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
  payload: GraphQLRequestPayload;
  publicFileUrlsExpireIn?: number | null;
}

export async function executeGraphQLRequest<TData>(
  input: ExecuteGraphQLRequestInput,
): Promise<GraphQLResponseEnvelope<TData>> {
  let response: OAuthHttpResponse & { headers?: Headers } & { status: number };

  try {
    response = (await (input.fetchImpl ?? fetch)(input.baseUrl, {
      method: "POST",
      headers: buildGraphQLHeaders(input),
      body: JSON.stringify({
        operationName: input.payload.operationName,
        query: input.payload.query,
        variables: input.payload.variables ?? {},
      }),
    })) as OAuthHttpResponse & { headers?: Headers } & { status: number };
  } catch (error) {
    throw new CliError(
      `GraphQL request failed: ${formatCause(error)}`,
      EXIT_CODES.runtimeFailure,
      { cause: error },
    );
  }

  const parsed = (await response.json().catch(async () => ({
    data: null,
    errors: [
      {
        message: await response.text(),
      },
    ],
  }))) as {
    data?: TData | null;
    errors?: GraphQLErrorLike[];
  };

  const headers = response.headers ? normalizeHeaders(response.headers) : {};

  return {
    data: parsed.data ?? null,
    errors: parsed.errors ?? [],
    headers,
    rateLimit: parseRateLimitMetadata(headers),
    status: response.status,
  };
}

export function buildGraphQLHeaders(
  input: Pick<
    ExecuteGraphQLRequestInput,
    "authorization" | "extraHeaders" | "publicFileUrlsExpireIn"
  >,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (input.authorization) {
    headers.authorization = input.authorization;
  }

  if (input.publicFileUrlsExpireIn) {
    headers["public-file-urls-expire-in"] = String(input.publicFileUrlsExpireIn);
  }

  return {
    ...headers,
    ...(input.extraHeaders ?? {}),
  };
}

export function normalizeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

export function parseRateLimitMetadata(headers: Record<string, string>): RateLimitMetadata {
  return {
    complexityLimit: parseIntegerHeader(headers["x-ratelimit-complexity-limit"]),
    complexityRemaining: parseIntegerHeader(headers["x-ratelimit-complexity-remaining"]),
    complexityReset: headers["x-ratelimit-complexity-reset"] ?? null,
    complexityUsed: parseIntegerHeader(headers["x-complexity"]),
    endpointName: headers["x-ratelimit-endpoint-name"] ?? null,
    endpointRequestsLimit: parseIntegerHeader(headers["x-ratelimit-endpoint-requests-limit"]),
    endpointRequestsRemaining: parseIntegerHeader(
      headers["x-ratelimit-endpoint-requests-remaining"],
    ),
    endpointRequestsReset: headers["x-ratelimit-endpoint-requests-reset"] ?? null,
    requestsLimit: parseIntegerHeader(headers["x-ratelimit-requests-limit"]),
    requestsRemaining: parseIntegerHeader(headers["x-ratelimit-requests-remaining"]),
    requestsReset: headers["x-ratelimit-requests-reset"] ?? null,
  };
}

function parseIntegerHeader(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "unknown error";
}

