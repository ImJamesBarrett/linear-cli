import { Command } from "commander";

export function createGraphqlCommand(): Command {
  return new Command("graphql").description(
    "Execute raw GraphQL documents against the Linear API.",
  );
}

