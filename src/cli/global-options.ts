import type { Command } from "commander";

export function registerGlobalOptions(command: Command): void {
  command
    .option("--profile <name>", "use a named Linear CLI profile")
    .option("--format <human|json>", "set the output format", "human")
    .option("--header <name:value>", "add a request header", collectHeaders, [])
    .option(
      "--public-file-urls-expire-in <seconds>",
      "request signed public file URLs with an expiry window",
    )
    .option("--verbose", "print verbose diagnostics")
    .option(
      "--allow-partial-data",
      "treat GraphQL partial data responses as successful executions",
    );
}

function collectHeaders(value: string, headers: string[]): string[] {
  headers.push(value);
  return headers;
}

