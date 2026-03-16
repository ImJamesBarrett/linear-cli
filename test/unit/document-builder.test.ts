import { describe, expect, it } from "vitest";

import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";
import { buildCanonicalOperationDocument } from "../../src/core/graphql/document-builder.js";

describe("canonical document builder", () => {
  it("builds query documents with variables and default selection", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "issues");

    expect(entry).toBeDefined();

    const document = buildCanonicalOperationDocument(entry!);

    expect(document.operationName).toBe("IssuesQuery");
    expect(document.query).toContain("query IssuesQuery(");
    expect(document.query).toContain("issues(after: $after");
    expect(document.query).toContain(
      "nodes { id identifier url createdAt updatedAt } pageInfo { hasNextPage hasPreviousPage startCursor endCursor }",
    );
  });

  it("builds mutation documents with default payload selections", () => {
    const entry = mutationRegistry.entries.find(
      (candidate) => candidate.graphqlName === "issueCreate",
    );

    expect(entry).toBeDefined();

    const document = buildCanonicalOperationDocument(entry!);

    expect(document.operationName).toBe("IssueCreateMutation");
    expect(document.query).toContain("mutation IssueCreateMutation($input: IssueCreateInput!)");
    expect(document.query).toContain(
      "issueCreate(input: $input) { success lastSyncId issue { id identifier url createdAt updatedAt } }",
    );
  });

  it("allows explicit selection overrides", () => {
    const entry = queryRegistry.entries.find((candidate) => candidate.graphqlName === "viewer");

    expect(entry).toBeDefined();

    const document = buildCanonicalOperationDocument(entry!, {
      selectionOverride: "id name",
    });

    expect(document.selection).toBe("id name");
    expect(document.query).toContain("viewer { id name }");
  });
});

