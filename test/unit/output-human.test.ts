import { describe, expect, it } from "vitest";

import { buildHumanOutput } from "../../src/core/output/human.js";
import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";

describe("human output", () => {
  it("renders connections as numbered summaries with page info", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");

    expect(entry).toBeDefined();
    expect(
      buildHumanOutput(
        entry!,
        {
          data: {
            issues: {
              nodes: [
                {
                  id: "issue_1",
                  identifier: "ISS-1",
                  title: "First issue",
                },
              ],
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: "cursor-1",
                endCursor: "cursor-1",
              },
            },
          },
          errors: [],
          headers: {},
          pagination: {
            mode: "all",
            nodesFetched: 1,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: "cursor-1",
              endCursor: "cursor-1",
            },
            pagesFetched: 2,
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
      stdout:
        "1. ISS-1 First issue\nPageInfo: hasNextPage=false hasPreviousPage=false endCursor=cursor-1",
      stderr:
        "Pagination: pagesFetched=2 nodesFetched=1\n\nRate limit: requestsRemaining=1499 complexityRemaining=n/a",
    });
  });

  it("renders payloads with success metadata and nested entity summaries", () => {
    const entry = mutationRegistry.entries.find((candidate) => candidate.graphqlName === "issueCreate");

    expect(entry).toBeDefined();
    expect(
      buildHumanOutput(
        entry!,
        {
          data: {
            issueCreate: {
              success: true,
              lastSyncId: 42,
              issue: {
                id: "issue_1",
                identifier: "ISS-1",
                title: "Created issue",
              },
            },
          },
          errors: [],
          headers: {},
          pagination: null,
          rateLimit: createRateLimitFixture(),
          status: 200,
        },
        {
          verbose: false,
        },
      ).stdout,
    ).toContain("Success: true");

    expect(
      buildHumanOutput(
        entry!,
        {
          data: {
            issueCreate: {
              success: true,
              lastSyncId: 42,
              issue: {
                id: "issue_1",
                identifier: "ISS-1",
                title: "Created issue",
              },
            },
          },
          errors: [],
          headers: {},
          pagination: null,
          rateLimit: createRateLimitFixture(),
          status: 200,
        },
        {
          verbose: false,
        },
      ).stdout,
    ).toContain("Issue:\n  ISS-1 Created issue");
  });

  it("writes GraphQL diagnostics to stderr", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "viewer");

    expect(entry).toBeDefined();
    expect(
      buildHumanOutput(
        entry!,
        {
          data: {
            viewer: {
              id: "user_123",
              name: "Ada Lovelace",
            },
          },
          errors: [
            {
              message: "Partial failure.",
            },
          ],
          headers: {},
          pagination: null,
          rateLimit: createRateLimitFixture(),
          status: 200,
        },
        {
          verbose: false,
        },
      ).stderr,
    ).toBe("Errors:\n- Partial failure.");
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
