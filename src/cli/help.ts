import type { Command } from "commander";

export function configureHelp(program: Command): void {
  program.addHelpText(
    "after",
    [
      "",
      "Planned command groups:",
      "  linear auth ...",
      "  linear config ...",
      "  linear query <subcommand> ...",
      "  linear mutation <subcommand> ...",
      "  linear graphql raw ...",
      "  linear upload ...",
    ].join("\n"),
  );
}

