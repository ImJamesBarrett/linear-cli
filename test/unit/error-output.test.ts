import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultConfig } from "../../src/core/config/config-schema.js";
import {
  buildJsonErrorOutput,
  resolveErrorOutputFormat,
} from "../../src/core/runtime/error-output.js";
import { CliError, EXIT_CODES } from "../../src/core/runtime/exit-codes.js";

describe("error output", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a JSON envelope for runtime errors", () => {
    expect(buildJsonErrorOutput(new CliError("bad config", EXIT_CODES.authOrConfigFailure))).toEqual({
      data: null,
      errors: [{ message: "bad config" }],
      exitCode: EXIT_CODES.authOrConfigFailure,
    });
  });

  it("respects --format json from argv", async () => {
    await expect(resolveErrorOutputFormat(["--format", "json"])).resolves.toBe("json");
    await expect(resolveErrorOutputFormat(["--format=json"])).resolves.toBe("json");
  });

  it("falls back to env and config defaults when argv does not specify a format", async () => {
    await expect(resolveErrorOutputFormat([], { LINEAR_FORMAT: "json" })).resolves.toBe("json");
    const defaultConfig = createDefaultConfig();

    await expect(
      resolveErrorOutputFormat(
        ["--profile", "work"],
        {},
        async () => ({
          ...defaultConfig,
          profiles: {
            ...defaultConfig.profiles,
            work: {
              ...defaultConfig.profiles.default,
              format: "json",
            },
          },
        }),
      ),
    ).resolves.toBe("json");
  });

  it("returns null when help output should remain silent", () => {
    expect(
      buildJsonErrorOutput({
        code: "commander.helpDisplayed",
        message: "help",
      }),
    ).toBeNull();
  });
});
