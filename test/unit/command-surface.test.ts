import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";
import type { OperationRegistryEntry } from "../../src/core/registry/types.js";

type CommandSurfaceRow = {
  category: string;
  command_name: string;
  subcommands: string;
  arguments: string;
  flags: string;
  graphql_operation_used: string;
  description: string;
  entity: string;
  tags: string;
};

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "../..");
const COMMAND_SURFACE_PATH = path.join(REPO_ROOT, ".project/linear_command_surface.csv");

const CANONICAL_OPERATION_FLAGS = ["--select <fields|@file>", "--format <human|json>"];

const UTILITY_ROWS: CommandSurfaceRow[] = [
  {
    category: "utility",
    command_name: "linear auth",
    subcommands:
      "login | login-api-key | login-oauth | login-client-credentials | logout | status | profiles list | profiles use",
    arguments: "",
    flags:
      "--profile <name>, --api-key <value>, --access-token <value>, --client-id <value>, --client-secret <value>, --scopes <csv>, --actor <user|app>, --redirect-port <port>",
    graphql_operation_used: "",
    description:
      "Authenticate the CLI using personal API key, OAuth2 auth code + PKCE, or OAuth2 client credentials.",
    entity: "",
    tags: "",
  },
  {
    category: "utility",
    command_name: "linear config",
    subcommands: "get | set | unset | list",
    arguments: "<key> [value]",
    flags: "--profile <name>, --json",
    graphql_operation_used: "",
    description:
      "Manage CLI configuration defaults such as output format, profile, and header preferences.",
    entity: "",
    tags: "",
  },
  {
    category: "utility",
    command_name: "linear graphql",
    subcommands: "raw",
    arguments: "",
    flags:
      "--query <string|@file>, --variables <json|@file>, --operation-name <name>, --header <k=v>, --format <human|json>",
    graphql_operation_used: "arbitrary",
    description:
      "Execute an arbitrary GraphQL document against the Linear endpoint as a full-fidelity escape hatch.",
    entity: "",
    tags: "",
  },
  {
    category: "utility",
    command_name: "linear upload",
    subcommands: "file | delete",
    arguments: "<path> | <asset-url>",
    flags:
      "--content-type <mime>, --filename <name>, --size <bytes>, --make-public, --metadata <json|@file>, --format <human|json>",
    graphql_operation_used: "fileUpload, fileUploadDangerouslyDelete",
    description:
      "Convenience wrapper around fileUpload plus pre-signed PUT upload, and uploaded-asset deletion.",
    entity: "",
    tags: "",
  },
];

describe("generated command surface", () => {
  it("matches the inventory snapshot", async () => {
    const inventoryRows = await loadCommandSurfaceInventory();
    const generatedRows = [
      ...queryRegistry.entries.map((entry) => toCommandSurfaceRow(entry, "query")),
      ...mutationRegistry.entries.map((entry) => toCommandSurfaceRow(entry, "mutation")),
      ...UTILITY_ROWS,
    ].sort(compareRows);

    const expectedRows = inventoryRows.sort(compareRows);
    const comparison = compareCommandSurfaceRows(generatedRows, expectedRows);

    expect(comparison).toEqual({
      extraKeys: [],
      fieldMismatches: [],
      missingKeys: [],
    });
  });
});

async function loadCommandSurfaceInventory(): Promise<CommandSurfaceRow[]> {
  const text = await readFile(COMMAND_SURFACE_PATH, "utf8");
  return parseCsv(text);
}

function toCommandSurfaceRow(
  entry: OperationRegistryEntry,
  category: "query" | "mutation",
): CommandSurfaceRow {
  return {
    category,
    command_name: `linear ${category}`,
    subcommands: entry.cliSubcommand,
    arguments: entry.positionalArgumentsUsage,
    flags: [...entry.flagUsage, ...CANONICAL_OPERATION_FLAGS].join(", "),
    graphql_operation_used: entry.graphqlName,
    description: entry.description,
    entity: entry.entity,
    tags: entry.tags.join(", "),
  };
}

function compareCommandSurfaceRows(
  actualRows: CommandSurfaceRow[],
  expectedRows: CommandSurfaceRow[],
): {
  extraKeys: string[];
  fieldMismatches: Array<Record<string, string>>;
  missingKeys: string[];
} {
  const actual = new Map(actualRows.map((row) => [createRowKey(row), row]));
  const expected = new Map(expectedRows.map((row) => [createRowKey(row), row]));

  const missingKeys = [...expected.keys()].filter((key) => !actual.has(key));
  const extraKeys = [...actual.keys()].filter((key) => !expected.has(key));
  const fieldMismatches = [...expected.keys()]
    .filter((key) => actual.has(key) && expected.has(key))
    .flatMap((key) => {
      const actualRow = actual.get(key)!;
      const expectedRow = expected.get(key)!;
      const mismatchedFields = Object.keys(expectedRow).filter((field) => {
        const typedField = field as keyof CommandSurfaceRow;
        return actualRow[typedField] !== expectedRow[typedField];
      });

      if (mismatchedFields.length === 0) {
        return [];
      }

      return [
        {
          key,
          fields: mismatchedFields.join(", "),
          actual: JSON.stringify(actualRow),
          expected: JSON.stringify(expectedRow),
        },
      ];
    });

  return {
    extraKeys,
    fieldMismatches,
    missingKeys,
  };
}

function createRowKey(row: CommandSurfaceRow): string {
  return [row.category, row.command_name, row.subcommands].join("::");
}

function compareRows(left: CommandSurfaceRow, right: CommandSurfaceRow): number {
  return createRowKey(left).localeCompare(createRowKey(right));
}

function parseCsv(input: string): CommandSurfaceRow[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === "\"") {
      if (insideQuotes && nextCharacter === "\"") {
        currentField += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      currentField = "";

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const [header, ...dataRows] = rows;

  return dataRows.map((row) => {
    const result = {} as CommandSurfaceRow;

    header.forEach((column, index) => {
      const key = column as keyof CommandSurfaceRow;
      result[key] = row[index] ?? "";
    });

    return result;
  });
}
