import { Command } from "commander";

export function createMutationCommand(): Command {
  return new Command("mutation").description("Execute generated Linear GraphQL mutations.");
}

