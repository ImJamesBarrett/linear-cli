import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createProgram } from "../../src/cli/program.js";
import { mutationRegistry } from "../../src/generated/mutation-registry.js";
import { queryRegistry } from "../../src/generated/query-registry.js";

type CommandSurfaceRow = {
  arguments: string;
  category: string;
  command_name: string;
  subcommands: string;
};

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "../..");
const COMMAND_SURFACE_PATH = path.join(REPO_ROOT, "reference/linear_command_surface.csv");

describe("command surface smoke", () => {
  it("parses every generated query and mutation inventory row", async () => {
    const rows = (await loadCommandSurfaceInventory()).filter(
      (row) => row.category === "query" || row.category === "mutation",
    );
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw { code: "process.exit", exitCode: code ?? 0 };
      }) as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((() => true) as never);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((() => true) as never);

    try {
      expect(rows).toHaveLength(
        queryRegistry.entries.length + mutationRegistry.entries.length,
      );

      for (const row of rows) {
        const argv = buildSmokeArgv(row);
        const program = createProgram();
        program.configureOutput({
          outputError: () => undefined,
          writeErr: () => undefined,
          writeOut: () => undefined,
        });

        try {
          await program.parseAsync(argv, {
            from: "user",
          });
        } catch (error) {
          if (!isHelpDisplayed(error) && !isSuccessfulExit(error)) {
            throw new Error(`${argv.join(" ")} failed to parse: ${String(error)}`);
          }
        }
      }
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

async function loadCommandSurfaceInventory(): Promise<CommandSurfaceRow[]> {
  const text = await readFile(COMMAND_SURFACE_PATH, "utf8");
  return parseCsv(text);
}

function buildSmokeArgv(row: CommandSurfaceRow): string[] {
  const commandParts = row.command_name.split(/\s+/).slice(1);
  const positionalArgs = [...row.arguments.matchAll(/<([^>]+)>/g)].map((match) =>
    placeholderForArgument(match[1]),
  );

  return [...commandParts, row.subcommands, ...positionalArgs, "--help"];
}

function placeholderForArgument(argumentName: string): string {
  return argumentName.toLowerCase().includes("id") ? "sample-id" : "sample-value";
}

function isHelpDisplayed(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "commander.helpDisplayed"
  );
}

function isSuccessfulExit(error: unknown): error is { code: string; exitCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "exitCode" in error &&
    (error as { code?: string }).code === "process.exit" &&
    (error as { exitCode?: number }).exitCode === 0
  );
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
      if (
        column === "arguments" ||
        column === "category" ||
        column === "command_name" ||
        column === "subcommands"
      ) {
        result[column] = row[index] ?? "";
      }
    });

    return result;
  });
}
