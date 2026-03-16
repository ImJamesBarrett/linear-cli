import type { GraphQLErrorLike, RateLimitMetadata } from "../graphql/client.js";
import { extractConnectionPage, isConnectionOperation } from "../graphql/pagination/connection.js";
import type { OperationRegistryEntry } from "../registry/types.js";
import type { CommandExecutionEnvelope } from "./types.js";

const DETAIL_FIELDS = ["id", "identifier", "title", "name", "url", "createdAt", "updatedAt"];
const PAYLOAD_META_FIELDS = ["success", "lastSyncId"];

export interface HumanOutputResult {
  stderr: string;
  stdout: string;
}

export function buildHumanOutput(
  entry: OperationRegistryEntry,
  envelope: CommandExecutionEnvelope,
  options: {
    verbose: boolean;
  },
): HumanOutputResult {
  const stdout = renderHumanData(entry, envelope.data);
  const diagnostics: string[] = [];

  if (envelope.errors.length > 0) {
    diagnostics.push(renderErrors(envelope.errors));
  }

  if (options.verbose) {
    if (envelope.pagination) {
      diagnostics.push(
        `Pagination: pagesFetched=${envelope.pagination.pagesFetched} nodesFetched=${envelope.pagination.nodesFetched}`,
      );
    }

    const rateLimitSummary = renderRateLimit(envelope.rateLimit);

    if (rateLimitSummary) {
      diagnostics.push(rateLimitSummary);
    }
  }

  return {
    stderr: diagnostics.join("\n\n"),
    stdout,
  };
}

export function writeHumanOutput(
  entry: OperationRegistryEntry,
  envelope: CommandExecutionEnvelope,
  options: {
    verbose: boolean;
  },
): void {
  const output = buildHumanOutput(entry, envelope, options);

  if (output.stdout) {
    console.log(output.stdout);
  }

  if (output.stderr) {
    console.error(output.stderr);
  }
}

function renderHumanData(entry: OperationRegistryEntry, data: unknown): string {
  if (data === null || data === undefined) {
    return "";
  }

  if (isConnectionOperation(entry)) {
    const page = extractConnectionPage(entry, data);
    const lines = page.nodes.length === 0
      ? ["No results."]
      : page.nodes.map((node, index) => `${index + 1}. ${summarizeRecord(node)}`);

    lines.push(
      `PageInfo: hasNextPage=${page.pageInfo.hasNextPage} hasPreviousPage=${page.pageInfo.hasPreviousPage} endCursor=${page.pageInfo.endCursor ?? "null"}`,
    );

    return lines.join("\n");
  }

  const value = getOperationResultValue(entry, data);

  switch (entry.defaultSelectionStrategy) {
    case "payload":
      return renderPayload(value);
    case "scalar":
      return String(value);
    case "entity":
    case "unknown":
    default:
      return renderRecordDetails(value);
  }
}

function renderPayload(value: unknown): string {
  const record = asRecord(value);

  if (!record) {
    return String(value);
  }

  const lines: string[] = [];

  if ("success" in record) {
    lines.push(`Success: ${String(record.success)}`);
  }

  if ("lastSyncId" in record) {
    lines.push(`Last sync ID: ${String(record.lastSyncId)}`);
  }

  const nestedEntry = Object.entries(record).find(
    ([key]) => !PAYLOAD_META_FIELDS.includes(key),
  );

  if (nestedEntry) {
    const [key, nestedValue] = nestedEntry;
    const nestedDetails = renderRecordDetails(nestedValue);

    if (nestedDetails) {
      lines.push(`${labelForField(key)}:\n${indent(nestedDetails)}`);
    } else {
      lines.push(`${labelForField(key)}: ${String(nestedValue)}`);
    }
  }

  return lines.join("\n");
}

function renderRecordDetails(value: unknown): string {
  const record = asRecord(value);

  if (!record) {
    return String(value);
  }

  const lines: string[] = [];
  const summary = summarizeRecord(record);

  if (summary) {
    lines.push(summary);
  }

  for (const field of DETAIL_FIELDS) {
    const fieldValue = record[field];

    if (fieldValue === undefined || fieldValue === null) {
      continue;
    }

    lines.push(`${labelForField(field)}: ${String(fieldValue)}`);
  }

  return dedupeLines(lines).join("\n");
}

function summarizeRecord(value: unknown): string {
  const record = asRecord(value);

  if (!record) {
    return String(value);
  }

  const identifier = stringField(record.identifier);
  const title = stringField(record.title);
  const name = stringField(record.name);
  const id = stringField(record.id);

  if (identifier && title) {
    return `${identifier} ${title}`;
  }

  if (identifier && name) {
    return `${identifier} ${name}`;
  }

  if (title) {
    return title;
  }

  if (name) {
    return name;
  }

  if (identifier) {
    return identifier;
  }

  return id ?? JSON.stringify(record);
}

function getOperationResultValue(entry: OperationRegistryEntry, data: unknown): unknown {
  const record = asRecord(data);
  return record?.[entry.graphqlName] ?? data;
}

function renderErrors(errors: GraphQLErrorLike[]): string {
  return ["Errors:", ...errors.map((error) => `- ${error.message}`)].join("\n");
}

function renderRateLimit(rateLimit: RateLimitMetadata): string | null {
  if (rateLimit.requestsRemaining === null && rateLimit.complexityRemaining === null) {
    return null;
  }

  return `Rate limit: requestsRemaining=${rateLimit.requestsRemaining ?? "n/a"} complexityRemaining=${rateLimit.complexityRemaining ?? "n/a"}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function labelForField(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function indent(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function dedupeLines(lines: string[]): string[] {
  return [...new Set(lines)];
}
