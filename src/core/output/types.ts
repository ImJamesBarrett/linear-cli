import type { GraphQLResponseEnvelope } from "../graphql/client.js";
import type { PaginationMetadata } from "../graphql/pagination/execute-all.js";

export interface CommandExecutionEnvelope<TData = unknown>
  extends GraphQLResponseEnvelope<TData> {
  pagination: PaginationMetadata | null;
}
