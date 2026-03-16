import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: fetchMock,
}));

import { createProgram } from "../../src/cli/program.js";
import { GraphQLExecutionError } from "../../src/core/graphql/errors.js";

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

describe("command execution integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv("LINEAR_ACCESS_TOKEN", "integration-access-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("executes raw GraphQL documents through the CLI", async () => {
    let requestBody = "";
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      requestBody = String(init?.body ?? "");

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
    });

    const result = await runCli([
      "graphql",
      "raw",
      "--query",
      "query ViewerQuery { viewer { id } }",
      "--operation-name",
      "ViewerQuery",
    ]);

    expect(requestBody).toContain("\"operationName\":\"ViewerQuery\"");
    expect(requestBody).toContain("query ViewerQuery { viewer { id } }");
    expect(result.stdout.join("\n")).toContain("\"viewer\"");
  });

  it("executes canonical generated queries through the CLI", async () => {
    let requestBody = "";
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      requestBody = String(init?.body ?? "");

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
    });

    await runCli(["query", "viewer", "--select", "id"]);

    expect(requestBody).toContain("\"operationName\":\"ViewerQuery\"");
    expect(requestBody).toContain("viewer { id }");
  });

  it("executes canonical generated mutations and loads JSON input from @file", async () => {
    let requestBody = "";
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              lastSyncId: 1,
              issue: {
                id: "issue_123",
                identifier: "ISS-123",
                title: "Fixture issue",
              },
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
    });

    const result = await runCli([
      "mutation",
      "issue-create",
      "--input",
      `@${path.join(FIXTURES_DIR, "issue-create-input.json")}`,
      "--select",
      "success issue { id identifier title }",
    ]);

    expect(requestBody).toContain("\"operationName\":\"IssueCreateMutation\"");
    expect(requestBody).toContain("\"teamId\":\"team_123\"");
    expect(requestBody).toContain("\"title\":\"Fixture issue\"");
    expect(result.stdout.join("\n")).toContain("Success: true");
  });

  it("executes grouped aliases from the root command", async () => {
    let requestBody = "";
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue_123",
                identifier: "ISS-123",
                title: "Grouped alias issue",
              },
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
    });

    const result = await runCli([
      "issue",
      "create",
      "--input",
      `@${path.join(FIXTURES_DIR, "issue-create-input.json")}`,
      "--select",
      "success issue { id identifier title }",
    ]);

    expect(requestBody).toContain("\"operationName\":\"IssueCreateMutation\"");
    expect(result.stdout.join("\n")).toContain("Success: true");
  });

  it("fails on partial GraphQL data unless --allow-partial-data is set", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                id: "user_123",
              },
            },
            errors: [
              {
                message: "Partial failure.",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
    );

    await expect(runCli(["query", "viewer", "--select", "id"], { expectFailure: true })).rejects.toBeInstanceOf(
      GraphQLExecutionError,
    );

    const result = await runCli(["--allow-partial-data", "query", "viewer", "--select", "id"]);

    expect(result.stderr.join("\n")).toContain("Partial failure.");
  });
});

async function runCli(
  args: string[],
  options: {
    expectFailure?: boolean;
  } = {},
): Promise<{ stderr: string[]; stdout: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
    stdout.push(String(value ?? ""));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((value?: unknown) => {
    stderr.push(String(value ?? ""));
  });

  try {
    const execution = createProgram().parseAsync(args, {
      from: "user",
    });

    if (options.expectFailure) {
      await execution;
      throw new Error("Expected the CLI invocation to fail.");
    }

    await execution;

    return { stderr, stdout };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}
