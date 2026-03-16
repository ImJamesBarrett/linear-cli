import { describe, expect, it } from "vitest";

import { EXIT_CODES } from "../../src/core/runtime/exit-codes.js";
import {
  assertGraphQLSuccess,
  classifyGraphQLResponse,
  GraphQLExecutionError,
} from "../../src/core/graphql/errors.js";
import type { GraphQLResponseEnvelope } from "../../src/core/graphql/client.js";

describe("graphql error classification", () => {
  it("classifies auth failures from HTTP status", () => {
    const result = classifyGraphQLResponse(
      createEnvelope({
        status: 401,
      }),
    );

    expect(result).toEqual({
      exitCode: EXIT_CODES.authOrConfigFailure,
      kind: "auth",
      message: "GraphQL request was rejected due to invalid or missing authentication.",
    });
  });

  it("classifies rate limit responses from headers", () => {
    const result = classifyGraphQLResponse(
      createEnvelope({
        rateLimit: {
          complexityLimit: null,
          complexityRemaining: 0,
          complexityReset: null,
          complexityUsed: null,
          endpointName: null,
          endpointRequestsLimit: null,
          endpointRequestsRemaining: null,
          endpointRequestsReset: null,
          requestsLimit: 1500,
          requestsRemaining: 0,
          requestsReset: null,
        },
      }),
    );

    expect(result?.kind).toBe("rate-limit");
    expect(result?.exitCode).toBe(EXIT_CODES.rateLimited);
  });

  it("classifies validation errors from graphql errors", () => {
    const result = classifyGraphQLResponse(
      createEnvelope({
        errors: [
          {
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
            message: "Cannot query field \"foo\" on type \"Query\".",
          },
        ],
      }),
    );

    expect(result?.kind).toBe("validation");
    expect(result?.exitCode).toBe(EXIT_CODES.validationFailure);
  });

  it("classifies partial data unless explicitly allowed", () => {
    const envelope = createEnvelope({
      data: { viewer: { id: "user_123" } },
      errors: [
        {
          message: "Field error",
        },
      ],
    });

    const rejected = classifyGraphQLResponse(envelope);
    const allowed = classifyGraphQLResponse(envelope, { allowPartialData: true });

    expect(rejected?.kind).toBe("partial-data");
    expect(rejected?.exitCode).toBe(EXIT_CODES.partialDataFailure);
    expect(allowed).toBeNull();
  });

  it("throws a typed execution error when asserting failure", () => {
    expect(() =>
      assertGraphQLSuccess(
        createEnvelope({
          errors: [
            {
              message: "Execution failed",
            },
          ],
        }),
      ),
    ).toThrow(GraphQLExecutionError);
  });
});

function createEnvelope(
  overrides: Partial<GraphQLResponseEnvelope<unknown>>,
): GraphQLResponseEnvelope<unknown> {
  return {
    data: null,
    errors: [],
    headers: {},
    rateLimit: {
      complexityLimit: null,
      complexityRemaining: null,
      complexityReset: null,
      complexityUsed: null,
      endpointName: null,
      endpointRequestsLimit: null,
      endpointRequestsRemaining: null,
      endpointRequestsReset: null,
      requestsLimit: null,
      requestsRemaining: null,
      requestsReset: null,
    },
    status: 200,
    ...overrides,
  };
}

