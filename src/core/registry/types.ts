export type RegistryOperationKind = "query" | "mutation";

export type RegistryTag = "alpha" | "deprecated" | "internal";

export type DefaultSelectionStrategy =
  | "connection"
  | "entity"
  | "payload"
  | "scalar"
  | "unknown";

export type GraphQLTypeRefKind = "LIST" | "NAMED" | "NON_NULL";

export type RegistryArgumentKind =
  | "enum"
  | "id"
  | "input"
  | "json"
  | "list"
  | "scalar";

export type EntityRegistryKind = "INTERFACE" | "OBJECT";

export type RelationshipRegistryKind = "connection" | "direct";

export interface GeneratedRegistryMetadata {
  schemaPath: string;
  schemaSourceUrl: string;
  generatedAt: string;
  queryCount: number;
  mutationCount: number;
  entityCount: number;
  relationshipCount: number;
  commandCount: number;
}

export interface GraphQLTypeRef {
  kind: GraphQLTypeRefKind;
  name: string | null;
  ofType: GraphQLTypeRef | null;
}

export interface RegistryArgumentDefinition {
  graphqlName: string;
  cliFlag: string | null;
  positionalName: string | null;
  description: string;
  kind: RegistryArgumentKind;
  typeRef: GraphQLTypeRef;
  required: boolean;
  repeatable: boolean;
}

export interface OperationRegistryEntry {
  kind: RegistryOperationKind;
  graphqlName: string;
  cliCommand: string;
  cliSubcommand: string;
  entity: string;
  description: string;
  arguments: RegistryArgumentDefinition[];
  graphqlArgsSignature: string;
  positionalArgumentsUsage: string;
  flagUsage: string[];
  returnType: GraphQLTypeRef;
  returnTypeSignature: string;
  tags: RegistryTag[];
  deprecatedReason: string | null;
  sourceLine: number | null;
  defaultSelectionStrategy: DefaultSelectionStrategy;
}

export interface EntityRegistryEntry {
  entity: string;
  kind: EntityRegistryKind;
  implements: string[];
  description: string;
  tags: RegistryTag[];
  sourceLine: number | null;
}

export interface ConnectionRegistryEntry {
  connectionType: string;
  edgeType: string | null;
  nodeType: string | null;
  pageInfoFieldName: string | null;
  totalCountFieldName: string | null;
}

export interface RelationshipRegistryEntry {
  sourceEntity: string;
  relationField: string;
  targetEntity: string;
  relationKind: RelationshipRegistryKind;
  description: string;
  graphqlArgsSignature: string;
}

export interface GeneratedRegistry<TEntry> {
  metadata: GeneratedRegistryMetadata;
  entries: TEntry[];
}

