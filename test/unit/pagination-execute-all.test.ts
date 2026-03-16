import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../src/core/auth/oauth-auth.js";
import { executeAllConnectionPages } from "../../src/core/graphql/pagination/execute-all.js";
import { queryRegistry } from "../../src/generated/query-registry.js";

describe("pagination execute-all", () => {
  it("walks forward pages and aggregates connection nodes", async () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");
    const requestBodies: string[] = [];

    const result = await executeAllConnectionPages<{ issues: { nodes: Array<{ id: string }>; pageInfo: unknown } }>(
      entry!,
      {
        baseUrl: "https://example.com/graphql",
        fetchImpl: createPaginatedFetchStub(requestBodies),
        selectionOverride: "nodes { id } pageInfo { hasNextPage hasPreviousPage startCursor endCursor }",
        variables: {
          filter: {
            team: {
              id: {
                eq: "team_123",
              },
            },
          },
        },
      },
    );

    expect(result.data?.issues.nodes).toEqual([{ id: "ISS-1" }, { id: "ISS-2" }]);
    expect(result.pagination).toEqual({
      mode: "all",
      nodesFetched: 2,
      pageInfo: {
        endCursor: "cursor-2",
        hasNextPage: false,
        hasPreviousPage: true,
        startCursor: "cursor-2",
      },
      pagesFetched: 2,
      totalCount: null,
    });
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toContain("\"first\":50");
    expect(requestBodies[0]).not.toContain("\"after\":");
    expect(requestBodies[1]).toContain("\"after\":\"cursor-1\"");
  });
});

function createPaginatedFetchStub(requestBodies: string[]): FetchLike {
  let callCount = 0;

  return async (_url, init) => {
    const body = String((init as { body?: string } | undefined)?.body ?? "");
    requestBodies.push(body);
    callCount += 1;

    const responseBody =
      callCount === 1
        ? {
            data: {
              issues: {
                nodes: [{ id: "ISS-1" }],
                pageInfo: {
                  hasNextPage: true,
                  hasPreviousPage: false,
                  startCursor: "cursor-1",
                  endCursor: "cursor-1",
                },
              },
            },
          }
        : {
            data: {
              issues: {
                nodes: [{ id: "ISS-2" }],
                pageInfo: {
                  hasNextPage: false,
                  hasPreviousPage: true,
                  startCursor: "cursor-2",
                  endCursor: "cursor-2",
                },
              },
            },
          };

    return new Response(JSON.stringify(responseBody), {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
    });
  };
}
