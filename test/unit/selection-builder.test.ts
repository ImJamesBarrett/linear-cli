import { describe, expect, it } from "vitest";

import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";
import { buildDefaultSelection } from "../../src/core/graphql/selection-builder.js";

describe("default selection builder", () => {
  it("builds entity selections with identifying fields", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issue");

    expect(entry).toBeDefined();
    expect(buildDefaultSelection(entry!)).toBe("id identifier url createdAt updatedAt");
  });

  it("builds connection selections with nodes and pageInfo", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");

    expect(entry).toBeDefined();
    expect(buildDefaultSelection(entry!)).toContain(
      "nodes { id identifier url createdAt updatedAt }",
    );
    expect(buildDefaultSelection(entry!)).toContain(
      "pageInfo { hasNextPage hasPreviousPage startCursor endCursor }",
    );
  });

  it("builds payload selections with success and the primary nested entity", () => {
    const entry = mutationRegistry.entries.find(
      (candidate) => candidate.graphqlName === "issueCreate",
    );

    expect(entry).toBeDefined();
    expect(buildDefaultSelection(entry!)).toBe(
      "success lastSyncId issue { id identifier url createdAt updatedAt }",
    );
  });

  it("returns an empty selection for scalar returns", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "_dummy");

    expect(entry).toBeDefined();
    expect(buildDefaultSelection(entry!)).toBe("");
  });
});
