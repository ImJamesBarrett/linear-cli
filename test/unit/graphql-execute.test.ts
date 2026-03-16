import { describe, expect, it } from "vitest";

import { queryRegistry } from "../../src/generated/query-registry.js";
import type { FetchLike } from "../../src/core/auth/oauth-auth.js";
import { executeCanonicalGraphQLOperation, executeRawGraphQL } from "../../src/core/graphql/execute.js";

describe("graphql execute helpers", () => {
  it("executes a canonical operation with generated documents", async () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "viewer");
    let capturedBody = "";

    const result = await executeCanonicalGraphQLOperation<{ viewer: { id: string } }>(entry!, {
      baseUrl: "https://example.com/graphql",
      fetchImpl: createFetchStub((body) => {
        capturedBody = body;
      }),
      selectionOverride: "id",
    });

    expect(result.data).toEqual({
      viewer: {
        id: "user_123",
      },
    });
    expect(capturedBody).toContain("\"operationName\":\"ViewerQuery\"");
    expect(capturedBody).toContain("viewer { id }");
  });

  it("executes raw operations unchanged", async () => {
    let capturedBody = "";

    const result = await executeRawGraphQL<{ viewer: { id: string } }>({
      baseUrl: "https://example.com/graphql",
      fetchImpl: createFetchStub((body) => {
        capturedBody = body;
      }),
      operationName: "ViewerQuery",
      query: "query ViewerQuery { viewer { id } }",
    });

    expect(result.data?.viewer.id).toBe("user_123");
    expect(capturedBody).toContain("query ViewerQuery { viewer { id } }");
  });
});

function createFetchStub(onBody: (body: string) => void): FetchLike {
  return async (_url, init) => {
    const body = String((init as { body?: string } | undefined)?.body ?? "");
    onBody(body);

    return new Response(
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
        },
        status: 200,
      },
    );
  };
}

