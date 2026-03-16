import { describe, expect, it } from "vitest";

import { buildJsonOutput } from "../../src/core/output/json.js";
import { queryRegistry } from "../../src/generated/query-registry.js";

describe("json output", () => {
  it("preserves GraphQL data and errors by default", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "viewer");

    expect(entry).toBeDefined();
    expect(
      buildJsonOutput(
        entry!,
        {
          data: {
            viewer: {
              id: "user_123",
            },
          },
          errors: [],
          headers: {
            "x-ratelimit-requests-remaining": "1499",
          },
          pagination: null,
          rateLimit: createRateLimitFixture(),
          status: 200,
        },
        {
          verbose: false,
        },
      ),
    ).toEqual({
      data: {
        viewer: {
          id: "user_123",
        },
      },
      errors: [],
    });
  });

  it("adds pageInfo for connection responses and verbose metadata on request", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");

    expect(entry).toBeDefined();
    expect(
      buildJsonOutput(
        entry!,
        {
          data: {
            issues: {
              nodes: [{ id: "ISS-1" }],
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: "cursor-1",
                endCursor: "cursor-1",
              },
            },
          },
          errors: [],
          headers: {
            "x-ratelimit-requests-remaining": "1499",
          },
          pagination: {
            mode: "all",
            nodesFetched: 1,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: "cursor-1",
              endCursor: "cursor-1",
            },
            pagesFetched: 1,
            totalCount: null,
          },
          rateLimit: createRateLimitFixture(),
          status: 200,
        },
        {
          verbose: true,
        },
      ),
    ).toEqual({
      data: {
        issues: {
          nodes: [{ id: "ISS-1" }],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: "cursor-1",
            endCursor: "cursor-1",
          },
        },
      },
      errors: [],
      headers: {
        "x-ratelimit-requests-remaining": "1499",
      },
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: "cursor-1",
        endCursor: "cursor-1",
      },
      pagination: {
        mode: "all",
        nodesFetched: 1,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: "cursor-1",
          endCursor: "cursor-1",
        },
        pagesFetched: 1,
        totalCount: null,
      },
      rateLimit: createRateLimitFixture(),
    });
  });
});

function createRateLimitFixture() {
  return {
    complexityLimit: null,
    complexityRemaining: null,
    complexityReset: null,
    complexityUsed: null,
    endpointName: null,
    endpointRequestsLimit: null,
    endpointRequestsRemaining: null,
    endpointRequestsReset: null,
    requestsLimit: null,
    requestsRemaining: 1499,
    requestsReset: null,
  };
}
