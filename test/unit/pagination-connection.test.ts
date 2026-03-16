import { describe, expect, it } from "vitest";

import { queryRegistry } from "../../src/generated/query-registry.js";
import {
  createNextForwardPaginationVariables,
  extractConnectionPage,
  findConnectionEntry,
  isConnectionOperation,
  resolveForwardPageSize,
} from "../../src/core/graphql/pagination/connection.js";

describe("pagination connection helpers", () => {
  it("detects connection-returning operations from the registry", () => {
    const issues = queryRegistry.entries.find((entry) => entry.cliSubcommand === "issues");
    const viewer = queryRegistry.entries.find((entry) => entry.cliSubcommand === "viewer");

    expect(issues).toBeDefined();
    expect(viewer).toBeDefined();
    expect(isConnectionOperation(issues!)).toBe(true);
    expect(isConnectionOperation(viewer!)).toBe(false);
    expect(findConnectionEntry(issues!)).toMatchObject({
      connectionType: "IssueConnection",
      nodeType: "Issue",
    });
    expect(findConnectionEntry(viewer!)).toBeNull();
  });

  it("extracts nodes and page info from a connection response", () => {
    const issues = queryRegistry.entries.find((entry) => entry.cliSubcommand === "issues");

    expect(issues).toBeDefined();
    expect(
      extractConnectionPage(issues!, {
        issues: {
          nodes: [{ id: "ISS-1" }, { id: "ISS-2" }],
          pageInfo: {
            hasNextPage: true,
            hasPreviousPage: false,
            startCursor: "cursor-1",
            endCursor: "cursor-2",
          },
        },
      }),
    ).toMatchObject({
      fieldName: "issues",
      nodes: [{ id: "ISS-1" }, { id: "ISS-2" }],
      pageInfo: {
        endCursor: "cursor-2",
        hasNextPage: true,
      },
    });
  });

  it("builds the next forward-pagination variable set", () => {
    expect(
      createNextForwardPaginationVariables(
        {
          filter: {
            team: {
              id: {
                eq: "team_123",
              },
            },
          },
        },
        {
          pageInfo: {
            endCursor: "cursor-2",
            hasNextPage: true,
            hasPreviousPage: false,
            startCursor: "cursor-1",
          },
        },
      ),
    ).toEqual({
      after: "cursor-2",
      before: undefined,
      filter: {
        team: {
          id: {
            eq: "team_123",
          },
        },
      },
      first: 50,
      last: undefined,
    });

    expect(resolveForwardPageSize({ first: 25 })).toBe(25);
  });
});
