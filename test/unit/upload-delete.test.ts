import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../src/core/auth/oauth-auth.js";
import { deleteLinearUploadedFile } from "../../src/core/upload/file-delete.js";

describe("upload delete helper", () => {
  it("wraps the fileUploadDangerouslyDelete mutation", async () => {
    let requestBody = "";

    const result = await deleteLinearUploadedFile({
      assetUrl: "https://assets.example.com/example.txt",
      baseUrl: "https://example.com/graphql",
      fetchImpl: createDeleteFetchStub((body) => {
        requestBody = body;
      }),
    });

    expect(result).toEqual({
      success: true,
    });
    expect(requestBody).toContain("\"operationName\":\"FileUploadDangerouslyDeleteMutation\"");
    expect(requestBody).toContain("\"assetUrl\":\"https://assets.example.com/example.txt\"");
  });
});

function createDeleteFetchStub(onBody: (body: string) => void): FetchLike {
  return async (_url, init) => {
    const body = String((init as { body?: string } | undefined)?.body ?? "");
    onBody(body);

    return new Response(
      JSON.stringify({
        data: {
          fileUploadDangerouslyDelete: {
            success: true,
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
