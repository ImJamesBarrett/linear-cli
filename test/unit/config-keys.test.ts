import { describe, expect, it } from "vitest";

import { createDefaultConfig } from "../../src/core/config/config-schema.js";
import {
  getConfigValue,
  listConfigValues,
  setConfigValue,
  unsetConfigValue,
} from "../../src/commands/config/keys.js";

describe("config key helpers", () => {
  it("gets and sets profile-scoped keys", () => {
    const config = setConfigValue(createDefaultConfig(), "baseUrl", "https://example.com/graphql", "work");

    expect(getConfigValue(config, "baseUrl", "work")).toBe("https://example.com/graphql");
    expect(getConfigValue(config, "defaultProfile", null)).toBe("default");
  });

  it("updates and removes profile headers", () => {
    const withHeader = setConfigValue(createDefaultConfig(), "headers.x-test", "value", "work");
    const withoutHeader = unsetConfigValue(withHeader, "headers.x-test", "work");

    expect(getConfigValue(withHeader, "headers.x-test", "work")).toBe("value");
    expect(getConfigValue(withoutHeader, "headers.x-test", "work")).toBeNull();
  });

  it("lists either the full config or a selected profile view", () => {
    const config = setConfigValue(createDefaultConfig(), "format", "json", "work");

    expect(listConfigValues(config, null)).toMatchObject({
      defaultProfile: "default",
      profiles: {
        default: expect.any(Object),
        work: expect.any(Object),
      },
    });
    expect(listConfigValues(config, "work")).toEqual({
      defaultProfile: "default",
      profile: {
        authMode: "apiKey",
        baseUrl: "https://api.linear.app/graphql",
        format: "json",
        headers: {},
        name: "work",
        publicFileUrlsExpireIn: null,
      },
    });
  });
});
