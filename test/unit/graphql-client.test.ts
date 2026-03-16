import { describe, expect, it } from "vitest";

import {
  buildGraphQLHeaders,
  executeGraphQLRequest,
  parseRateLimitMetadata,
} from "../../src/core/graphql/client.js";
import type { FetchLike } from "../../src/core/auth/oauth-auth.js";

describe("graphql client", () => {
  it("builds GraphQL request headers", () => {
    expect(
      buildGraphQLHeaders({
        authorization: "Bearer test-token",
        extraHeaders: {
          "x-custom-header": "custom-value",
        },
        publicFileUrlsExpireIn: 300,
      }),
    ).toEqual({
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "public-file-urls-expire-in": "300",
      "x-custom-header": "custom-value",
    });
  });

  it("parses rate-limit headers", () => {
    expect(
      parseRateLimitMetadata({
        "x-complexity": "12",
        "x-ratelimit-complexity-limit": "1000",
        "x-ratelimit-complexity-remaining": "988",
        "x-ratelimit-endpoint-name": "issues",
        "x-ratelimit-endpoint-requests-limit": "100",
        "x-ratelimit-endpoint-requests-remaining": "99",
        "x-ratelimit-endpoint-requests-reset": "2026-03-16T12:00:00.000Z",
        "x-ratelimit-requests-limit": "1500",
        "x-ratelimit-requests-remaining": "1499",
        "x-ratelimit-requests-reset": "2026-03-16T12:00:00.000Z",
      }),
    ).toEqual({
      complexityLimit: 1000,
      complexityRemaining: 988,
      complexityReset: null,
      complexityUsed: 12,
      endpointName: "issues",
      endpointRequestsLimit: 100,
      endpointRequestsRemaining: 99,
      endpointRequestsReset: "2026-03-16T12:00:00.000Z",
      requestsLimit: 1500,
      requestsRemaining: 1499,
      requestsReset: "2026-03-16T12:00:00.000Z",
    });
  });

  it("executes a GraphQL request and captures response metadata", async () => {
    const response = await executeGraphQLRequest<{ viewer: { id: string } }>({
      authorization: "Bearer test-token",
      baseUrl: "https://example.com/graphql",
      fetchImpl: createFetchStub(),
      payload: {
        operationName: "ViewerQuery",
        query: "query ViewerQuery { viewer { id } }",
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      viewer: {
        id: "user_123",
      },
    });
    expect(response.errors).toEqual([]);
    expect(response.rateLimit.requestsRemaining).toBe(1499);
  });
});

function createFetchStub(): FetchLike {
  return async () =>
    new Response(
      JSON.stringify({
        data: {
          viewer: {
            id: "user_123",
          },
        },
      }),
      {
        headers: {
          "content-type": "application/json",
          "x-complexity": "1",
          "x-ratelimit-requests-limit": "1500",
          "x-ratelimit-requests-remaining": "1499",
        },
        status: 200,
      },
    );
}

