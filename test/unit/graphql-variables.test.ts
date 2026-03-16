import { describe, expect, it } from "vitest";

import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";
import { CliError } from "../../src/core/runtime/exit-codes.js";
import {
  buildFieldArgumentBindings,
  buildVariableDefinitions,
  renderTypeRef,
  resolveOperationVariables,
} from "../../src/core/graphql/variables.js";

describe("graphql variable helpers", () => {
  it("renders variable definitions and field bindings", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");

    expect(entry).toBeDefined();
    expect(buildVariableDefinitions(entry!)).toContain("$filter: IssueFilter");
    expect(buildFieldArgumentBindings(entry!)).toContain("filter: $filter");
  });

  it("resolves variables from positional and option values", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issue");

    expect(entry).toBeDefined();
    expect(
      resolveOperationVariables(entry!, {
        options: {
          includeArchived: true,
        },
        positionals: {
          id: "issue_123",
        },
      }),
    ).toEqual({
      id: "issue_123",
    });
  });

  it("resolves complex input values from option keys", () => {
    const entry = mutationRegistry.entries.find(
      (candidate) => candidate.graphqlName === "issueCreate",
    );

    expect(entry).toBeDefined();
    expect(
      resolveOperationVariables(entry!, {
        options: {
          input: {
            teamId: "team_123",
            title: "Example issue",
          },
        },
      }),
    ).toEqual({
      input: {
        teamId: "team_123",
        title: "Example issue",
      },
    });
  });

  it("throws when a required argument is missing", () => {
    const entry = mutationRegistry.entries.find(
      (candidate) => candidate.graphqlName === "issueCreate",
    );

    expect(entry).toBeDefined();
    expect(() => resolveOperationVariables(entry!, { options: {} })).toThrow(CliError);
  });

  it("renders nested list and non-null type references", () => {
    expect(
      renderTypeRef({
        kind: "NON_NULL",
        name: null,
        ofType: {
          kind: "LIST",
          name: null,
          ofType: {
            kind: "NON_NULL",
            name: null,
            ofType: {
              kind: "NAMED",
              name: "String",
              ofType: null,
            },
          },
        },
      }),
    ).toBe("[String!]!");
  });
});

