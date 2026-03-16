import { mutationRegistry } from "../../generated/mutation-registry.js";
import type { FetchLike } from "../auth/oauth-auth.js";
import { executeCanonicalGraphQLOperation } from "../graphql/execute.js";
import { CliError, EXIT_CODES } from "../runtime/exit-codes.js";

export async function deleteLinearUploadedFile(input: {
  assetUrl: string;
  authorization?: string | null;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
  publicFileUrlsExpireIn?: number | null;
}): Promise<{ success: boolean }> {
  const entry = mutationRegistry.entries.find(
    (candidate) => candidate.graphqlName === "fileUploadDangerouslyDelete",
  );

  if (!entry) {
    throw new CliError(
      "The generated registry is missing the fileUploadDangerouslyDelete mutation.",
      EXIT_CODES.runtimeFailure,
    );
  }

  const envelope = await executeCanonicalGraphQLOperation<{
    fileUploadDangerouslyDelete: {
      success: boolean;
    };
  }>(entry, {
    authorization: input.authorization,
    baseUrl: input.baseUrl,
    extraHeaders: input.extraHeaders,
    fetchImpl: input.fetchImpl,
    publicFileUrlsExpireIn: input.publicFileUrlsExpireIn,
    selectionOverride: "success",
    variables: {
      assetUrl: input.assetUrl,
    },
  });

  return {
    success: envelope.data?.fileUploadDangerouslyDelete.success ?? false,
  };
}
