import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetch } from "undici";

const DEFAULT_SCHEMA_URL =
  "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, "src/generated/schema.graphql");

async function main(): Promise<void> {
  const schemaUrl = process.env.LINEAR_SCHEMA_URL ?? DEFAULT_SCHEMA_URL;
  const outputPath = process.env.LINEAR_SCHEMA_OUTPUT ?? DEFAULT_OUTPUT_PATH;

  const response = await fetch(schemaUrl, {
    method: "GET",
    headers: {
      "user-agent": "linear-cli/fetch-schema",
      accept: "application/graphql-response+json, text/plain;q=0.9, */*;q=0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`schema fetch failed with HTTP ${response.status}`);
  }

  const body = await response.text();

  if (body.trim().length === 0) {
    throw new Error("schema fetch returned an empty response body");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, body, "utf8");

  console.log(`Fetched schema from ${schemaUrl}`);
  console.log(`Wrote ${outputPath}`);
}

await main();
