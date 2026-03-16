import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { fetch } from "undici";

import { mutationRegistry } from "../../generated/mutation-registry.js";
import type { FetchLike } from "../auth/oauth-auth.js";
import { executeCanonicalGraphQLOperation } from "../graphql/execute.js";
import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";

export interface UploadFileResult {
  assetUrl: string;
  contentType: string;
  filename: string;
  lastSyncId: number | null;
  size: number;
  success: boolean;
}

export async function uploadLinearFile(input: {
  authorization?: string | null;
  baseUrl: string;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
  filePath: string;
  filename?: string;
  makePublic?: boolean;
  metadata?: unknown;
  publicFileUrlsExpireIn?: number | null;
  size?: number;
}): Promise<UploadFileResult> {
  const entry = mutationRegistry.entries.find((candidate) => candidate.graphqlName === "fileUpload");

  if (!entry) {
    throw new CliError(
      "The generated registry is missing the fileUpload mutation.",
      EXIT_CODES.runtimeFailure,
    );
  }

  const file = await prepareUploadFile(input.filePath, {
    contentType: input.contentType,
    filename: input.filename,
    size: input.size,
  });
  const envelope = await executeCanonicalGraphQLOperation<{
    fileUpload: {
      lastSyncId: number;
      success: boolean;
      uploadFile: {
        assetUrl: string;
        headers: Array<{ key: string; value: string }>;
        uploadUrl: string;
      } | null;
    };
  }>(entry, {
    authorization: input.authorization,
    baseUrl: input.baseUrl,
    extraHeaders: input.extraHeaders,
    fetchImpl: input.fetchImpl,
    publicFileUrlsExpireIn: input.publicFileUrlsExpireIn,
    selectionOverride:
      "success lastSyncId uploadFile { assetUrl uploadUrl headers { key value } }",
    variables: {
      contentType: file.contentType,
      filename: file.filename,
      makePublic: input.makePublic === true ? true : undefined,
      metaData: input.metadata,
      size: file.size,
    },
  });
  const uploadFile = envelope.data?.fileUpload.uploadFile;

  if (!uploadFile?.uploadUrl || !uploadFile.assetUrl) {
    throw new CliError(
      "Linear did not return an upload URL and asset URL.",
      EXIT_CODES.runtimeFailure,
    );
  }

  await putUploadedFile(uploadFile.uploadUrl, file.contents, uploadFile.headers, input.fetchImpl);

  return {
    assetUrl: uploadFile.assetUrl,
    contentType: file.contentType,
    filename: file.filename,
    lastSyncId: envelope.data?.fileUpload.lastSyncId ?? null,
    size: file.size,
    success: envelope.data?.fileUpload.success ?? false,
  };
}

export async function prepareUploadFile(
  filePath: string,
  overrides: {
    contentType?: string;
    filename?: string;
    size?: number;
  } = {},
): Promise<{
  contentType: string;
  contents: Buffer;
  filename: string;
  size: number;
}> {
  const [contents, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
  const filename = overrides.filename?.trim() || path.basename(filePath);
  const size = overrides.size ?? fileStat.size;

  if (!Number.isInteger(size) || size < 0) {
    throw new CliError(
      "Upload size must be a non-negative integer.",
      EXIT_CODES.validationFailure,
    );
  }

  return {
    contentType: overrides.contentType?.trim() || inferContentType(filename),
    contents,
    filename,
    size,
  };
}

async function putUploadedFile(
  uploadUrl: string,
  contents: Buffer,
  uploadHeaders: Array<{ key: string; value: string }>,
  fetchImpl?: FetchLike,
): Promise<void> {
  const headers = Object.fromEntries(uploadHeaders.map((header) => [header.key, header.value]));
  const response = await (fetchImpl ?? fetch)(uploadUrl, {
    body: contents,
    headers,
    method: "PUT",
  });

  if (!response.ok) {
    throw new CliError(
      `File upload PUT failed with HTTP ${response.status}.`,
      EXIT_CODES.runtimeFailure,
    );
  }
}

function inferContentType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".gif":
      return "image/gif";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    case ".mov":
      return "video/quicktime";
    case ".mp4":
      return "video/mp4";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
