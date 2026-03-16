import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  codeChallenge: string;
  codeVerifier: string;
}

export function createPkcePair(): PkcePair {
  const codeVerifier = toBase64Url(randomBytes(32));

  return {
    codeChallenge: toBase64Url(createHash("sha256").update(codeVerifier).digest()),
    codeVerifier,
  };
}

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

