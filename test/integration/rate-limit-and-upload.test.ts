import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: fetchMock,
}));

import { createProgram } from "../../src/cli/program.js";
import { GraphQLExecutionError } from "../../src/core/graphql/errors.js";
import { CliError } from "../../src/core/runtime/exit-codes.js";

describe("rate limit and upload integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv("LINEAR_ACCESS_TOKEN", "integration-access-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("surfaces rate limit failures through the CLI", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            errors: [
              {
                message: "Rate limit exceeded.",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
              "x-ratelimit-requests-remaining": "0",
            },
            status: 429,
          },
        ),
    );

    await expect(runCli(["query", "viewer", "--select", "id"])).rejects.toBeInstanceOf(
      GraphQLExecutionError,
    );
  });

  it("uploads files through the CLI helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-upload-integration-"));
    const filePath = path.join(tempDir, "upload.txt");
    let callCount = 0;
    await writeFile(filePath, "hello upload", "utf8");

    fetchMock.mockImplementation(async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                lastSyncId: 1,
                success: true,
                uploadFile: {
                  assetUrl: "https://assets.example.com/upload.txt",
                  headers: [],
                  uploadUrl: "https://uploads.example.com/upload",
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
      }

      return new Response(null, { status: 200 });
    });

    const result = await runCli(["upload", "file", filePath]);

    expect(result.stdout.join("\n")).toContain("https://assets.example.com/upload.txt");
  });

  it("fails when the upload PUT request is rejected", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-upload-integration-"));
    const filePath = path.join(tempDir, "upload.txt");
    let callCount = 0;
    await writeFile(filePath, "hello upload", "utf8");

    fetchMock.mockImplementation(async () => {
      callCount += 1;

      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            data: {
              fileUpload: {
                lastSyncId: 1,
                success: true,
                uploadFile: {
                  assetUrl: "https://assets.example.com/upload.txt",
                  headers: [],
                  uploadUrl: "https://uploads.example.com/upload",
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
      }

      return new Response(null, { status: 500 });
    });

    await expect(runCli(["upload", "file", filePath])).rejects.toBeInstanceOf(CliError);
  });
});

async function runCli(args: string[]): Promise<{ stderr: string[]; stdout: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
    stdout.push(String(value ?? ""));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((value?: unknown) => {
    stderr.push(String(value ?? ""));
  });

  try {
    await createProgram().parseAsync(args, {
      from: "user",
    });

    return { stderr, stdout };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}
