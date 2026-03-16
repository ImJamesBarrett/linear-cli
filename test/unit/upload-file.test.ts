import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../src/core/auth/oauth-auth.js";
import { CliError } from "../../src/core/runtime/exit-codes.js";
import { prepareUploadFile, uploadLinearFile } from "../../src/core/upload/file-upload.js";

describe("upload file helper", () => {
  it("infers upload metadata from the file path", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-upload-"));
    const filePath = path.join(tempDir, "example.txt");
    await writeFile(filePath, "hello world", "utf8");

    await expect(prepareUploadFile(filePath)).resolves.toMatchObject({
      contentType: "text/plain",
      filename: "example.txt",
      size: 11,
    });
  });

  it("uploads a file through GraphQL negotiation and binary PUT", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-upload-"));
    const filePath = path.join(tempDir, "example.txt");
    const requests: Array<{
      body?: unknown;
      headers?: Record<string, string>;
      method?: string;
      url: string;
    }> = [];
    await writeFile(filePath, "hello world", "utf8");

    const result = await uploadLinearFile({
      authorization: "Bearer test-token",
      baseUrl: "https://example.com/graphql",
      fetchImpl: createUploadFetchStub(requests),
      filePath,
    });

    expect(result).toMatchObject({
      assetUrl: "https://assets.example.com/example.txt",
      contentType: "text/plain",
      filename: "example.txt",
      size: 11,
      success: true,
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      body: expect.stringContaining("\"filename\":\"example.txt\""),
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      method: "POST",
      url: "https://example.com/graphql",
    });
    expect(requests[1]).toEqual({
      body: Buffer.from("hello world"),
      headers: {
        "cache-control": "public, max-age=31536000",
        "content-type": "text/plain",
        "x-amz-acl": "private",
      },
      method: "PUT",
      url: "https://uploads.example.com/upload",
    });
  });

  it("fails when the binary PUT request is rejected", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "linear-cli-upload-"));
    const filePath = path.join(tempDir, "example.txt");
    await writeFile(filePath, "hello world", "utf8");

    await expect(
      uploadLinearFile({
        baseUrl: "https://example.com/graphql",
        fetchImpl: createFailingUploadFetchStub(),
        filePath,
      }),
    ).rejects.toThrow(CliError);
  });
});

function createUploadFetchStub(
  requests: Array<{
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
    url: string;
  }>,
): FetchLike {
  let callCount = 0;

  return async (url, init) => {
    const normalizedUrl = String(url);
    const method = (init as { method?: string } | undefined)?.method ?? "GET";
    const body = (init as { body?: string } | undefined)?.body;
    const headers = normalizeHeaders((init as { headers?: unknown } | undefined)?.headers);
    requests.push({
      body,
      headers,
      method,
      url: normalizedUrl,
    });
    callCount += 1;

    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          data: {
            fileUpload: {
              lastSyncId: 1,
              success: true,
              uploadFile: {
                assetUrl: "https://assets.example.com/example.txt",
                headers: [{ key: "x-amz-acl", value: "private" }],
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
  };
}

function normalizeHeaders(input: unknown): Record<string, string> {
  if (input instanceof Headers) {
    return Object.fromEntries([...input.entries()].map(([key, value]) => [key.toLowerCase(), value]));
  }

  if (!input || typeof input !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function createFailingUploadFetchStub(): FetchLike {
  let callCount = 0;

  return async () => {
    callCount += 1;

    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          data: {
            fileUpload: {
              lastSyncId: 1,
              success: true,
              uploadFile: {
                assetUrl: "https://assets.example.com/example.txt",
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
  };
}
