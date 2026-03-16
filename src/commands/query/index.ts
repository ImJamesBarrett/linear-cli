import { Command } from "commander";

export function createQueryCommand(): Command {
  return new Command("query").description("Execute generated Linear GraphQL queries.");
}

