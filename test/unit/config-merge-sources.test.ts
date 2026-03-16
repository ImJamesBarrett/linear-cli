import { describe, expect, it } from "vitest";

import { createDefaultConfig } from "../../src/core/config/config-schema.js";
import { resolveProfileConfig } from "../../src/core/config/merge-sources.js";

describe("config merge sources", () => {
  it("prefers env and profile format when the CLI format flag is omitted", () => {
    const config = createDefaultConfig();
    config.profiles.default.format = "json";

    expect(
      resolveProfileConfig({
        cliOptions: {
          allowPartialData: false,
          format: null,
          headers: [],
          profile: null,
          publicFileUrlsExpireIn: null,
          verbose: false,
        },
        config,
        envOverrides: {},
      }).format,
    ).toBe("json");

    expect(
      resolveProfileConfig({
        cliOptions: {
          allowPartialData: false,
          format: null,
          headers: [],
          profile: null,
          publicFileUrlsExpireIn: null,
          verbose: false,
        },
        config,
        envOverrides: {
          LINEAR_FORMAT: "human",
        },
      }).format,
    ).toBe("human");
  });
});
