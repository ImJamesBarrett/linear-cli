import { describe, expect, it } from "vitest";

import { createProgram } from "../../src/cli/program.js";
import { queryRegistry } from "../../src/generated/query-registry.js";
import { CliError } from "../../src/core/runtime/exit-codes.js";
import {
  supportsAllPagination,
  validatePaginationInvocation,
} from "../../src/core/graphql/pagination/validation.js";

describe("pagination validation", () => {
  it("recognizes connection queries as eligible for --all", () => {
    const issues = queryRegistry.entries.find((entry) => entry.cliSubcommand === "issues");
    const viewer = queryRegistry.entries.find((entry) => entry.cliSubcommand === "viewer");

    expect(issues).toBeDefined();
    expect(viewer).toBeDefined();
    expect(supportsAllPagination(issues!)).toBe(true);
    expect(supportsAllPagination(viewer!)).toBe(false);
  });

  it("rejects --all with backward pagination", () => {
    const issues = queryRegistry.entries.find((entry) => entry.cliSubcommand === "issues");

    expect(issues).toBeDefined();
    expect(() =>
      validatePaginationInvocation(issues!, {
        all: true,
        last: 10,
      }),
    ).toThrow(CliError);
  });

  it("fails before execution when invalid pagination flags are provided", async () => {
    const program = createProgram();

    await expect(
      program.parseAsync(["query", "issues", "--all", "--last", "10"], {
        from: "user",
      }),
    ).rejects.toMatchObject({
      name: "CliError",
      message:
        "Cannot combine --all with backward pagination flags for linear query issues.",
    });
  });
});
