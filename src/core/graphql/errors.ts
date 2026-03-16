import { CliError, EXIT_CODES, type ExitCode } from "../runtime/exit-codes.js";
import type { GraphQLErrorLike, GraphQLResponseEnvelope } from "./client.js";

export type GraphQLErrorKind =
  | "auth"
  | "graphql"
  | "partial-data"
  | "rate-limit"
  | "transport"
  | "validation";

export interface ClassifiedGraphQLError {
  exitCode: ExitCode;
  kind: GraphQLErrorKind;
  message: string;
}

export class GraphQLExecutionError extends CliError {
  readonly details: ClassifiedGraphQLError;
  readonly envelope?: GraphQLResponseEnvelope<unknown>;

  constructor(details: ClassifiedGraphQLError, envelope?: GraphQLResponseEnvelope<unknown>) {
    super(details.message, details.exitCode);
    this.name = "GraphQLExecutionError";
    this.details = details;
    this.envelope = envelope;
  }
}

export function assertGraphQLSuccess<TData>(
  envelope: GraphQLResponseEnvelope<TData>,
  options: {
    allowPartialData?: boolean;
  } = {},
): GraphQLResponseEnvelope<TData> {
  const classified = classifyGraphQLResponse(envelope, options);

  if (classified) {
    throw new GraphQLExecutionError(classified, envelope);
  }

  return envelope;
}

export function classifyGraphQLResponse<TData>(
  envelope: GraphQLResponseEnvelope<TData>,
  options: {
    allowPartialData?: boolean;
  } = {},
): ClassifiedGraphQLError | null {
  if (envelope.status === 401 || envelope.status === 403) {
    return {
      exitCode: EXIT_CODES.authOrConfigFailure,
      kind: "auth",
      message: "GraphQL request was rejected due to invalid or missing authentication.",
    };
  }

  if (envelope.status === 429 || hasRateLimitSignal(envelope)) {
    return {
      exitCode: EXIT_CODES.rateLimited,
      kind: "rate-limit",
      message: "Linear rate limit exceeded.",
    };
  }

  if (envelope.status >= 400 && envelope.errors.length === 0) {
    return {
      exitCode: EXIT_CODES.runtimeFailure,
      kind: "transport",
      message: `GraphQL request failed with HTTP ${envelope.status}.`,
    };
  }

  if (envelope.errors.length === 0) {
    return null;
  }

  if (envelope.data !== null && options.allowPartialData) {
    return null;
  }

  if (envelope.data !== null) {
    return {
      exitCode: EXIT_CODES.partialDataFailure,
      kind: "partial-data",
      message: formatGraphQLErrors("GraphQL response returned partial data", envelope.errors),
    };
  }

  if (envelope.errors.some(isValidationError)) {
    return {
      exitCode: EXIT_CODES.validationFailure,
      kind: "validation",
      message: formatGraphQLErrors("GraphQL validation failed", envelope.errors),
    };
  }

  if (envelope.errors.some(isAuthError)) {
    return {
      exitCode: EXIT_CODES.authOrConfigFailure,
      kind: "auth",
      message: formatGraphQLErrors("GraphQL authentication failed", envelope.errors),
    };
  }

  if (envelope.errors.some(isRateLimitError)) {
    return {
      exitCode: EXIT_CODES.rateLimited,
      kind: "rate-limit",
      message: formatGraphQLErrors("GraphQL request was rate limited", envelope.errors),
    };
  }

  return {
    exitCode: EXIT_CODES.graphqlFailure,
    kind: "graphql",
    message: formatGraphQLErrors("GraphQL execution failed", envelope.errors),
  };
}

function hasRateLimitSignal(envelope: GraphQLResponseEnvelope<unknown>): boolean {
  return (
    envelope.rateLimit.requestsRemaining === 0 ||
    envelope.rateLimit.endpointRequestsRemaining === 0 ||
    envelope.rateLimit.complexityRemaining === 0
  );
}

function isAuthError(error: GraphQLErrorLike): boolean {
  const code = getErrorCode(error);
  return /auth|forbidden|unauth/i.test(code ?? "") || /auth|forbidden|unauth/i.test(error.message);
}

function isRateLimitError(error: GraphQLErrorLike): boolean {
  const code = getErrorCode(error);
  return /rate.?limit|throttle/i.test(code ?? "") || /rate.?limit|throttle/i.test(error.message);
}

function isValidationError(error: GraphQLErrorLike): boolean {
  const code = getErrorCode(error);
  return /validation|bad_user_input|invalid/i.test(code ?? "") || /cannot query field|unknown argument|validation/i.test(error.message);
}

function getErrorCode(error: GraphQLErrorLike): string | null {
  const code = error.extensions?.code;
  return typeof code === "string" ? code : null;
}

function formatGraphQLErrors(prefix: string, errors: GraphQLErrorLike[]): string {
  const messages = errors.map((error) => error.message.trim()).filter(Boolean);

  if (messages.length === 0) {
    return prefix;
  }

  return `${prefix}: ${messages.join("; ")}`;
}

