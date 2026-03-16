import { describe, expect, it } from "vitest";

import {
  CliError,
  EXIT_CODES,
  formatErrorMessage,
  resolveExitCode,
} from "../../src/core/runtime/exit-codes.js";

describe("exit code handling", () => {
  it("returns the embedded exit code for CliError instances", () => {
    expect(resolveExitCode(new CliError("bad config", EXIT_CODES.authOrConfigFailure))).toBe(
      EXIT_CODES.authOrConfigFailure,
    );
  });

  it("maps commander help and commander validation errors", () => {
    expect(
      resolveExitCode({
        code: "commander.helpDisplayed",
        message: "help",
      }),
    ).toBe(EXIT_CODES.success);

    expect(
      resolveExitCode({
        code: "commander.unknownOption",
        message: "unknown option",
      }),
    ).toBe(EXIT_CODES.validationFailure);
  });

  it("formats user-facing error messages consistently", () => {
    expect(formatErrorMessage(new Error("boom"))).toBe("boom");
    expect(
      formatErrorMessage({
        code: "commander.helpDisplayed",
        message: "help",
      }),
    ).toBeNull();
    expect(formatErrorMessage("boom")).toBe("An unknown error occurred.");
  });
});
