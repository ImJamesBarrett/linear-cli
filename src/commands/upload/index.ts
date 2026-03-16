import { Command } from "commander";

export function createUploadCommand(): Command {
  return new Command("upload").description(
    "Upload files to Linear storage and delete uploaded assets.",
  );
}

