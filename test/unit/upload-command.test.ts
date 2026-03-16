import { describe, expect, it } from "vitest";

import { createUploadCommand } from "../../src/commands/upload/index.js";

describe("upload command registration", () => {
  it("registers the file upload subcommand", () => {
    const command = createUploadCommand();

    expect(command.commands.map((subcommand) => subcommand.name())).toEqual(["file"]);
  });
});
