import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildASTSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  parse,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLInterfaceType,
  type GraphQLNamedType,
  type GraphQLObjectType,
  type GraphQLType,
} from "graphql";

import type {
  ConnectionRegistryEntry,
  DefaultSelectionStrategy,
  EntityRegistryEntry,
  GeneratedRegistryMetadata,
  GraphQLTypeRef,
  OperationRegistryEntry,
  RegistryArgumentDefinition,
  RegistryArgumentKind,
  RegistryTag,
  RelationshipRegistryEntry,
} from "../src/core/registry/types.js";

const DEFAULT_SCHEMA_SOURCE_URL =
  "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql";
const UTILITY_COMMAND_COUNT = 4;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GENERATED_DIR = path.join(REPO_ROOT, "src/generated");
const SCHEMA_PATH = path.join(GENERATED_DIR, "schema.graphql");
const INVENTORY_PATH = path.join(REPO_ROOT, ".project/linear_inventory.json");

type InventoryOperationRow = {
  arguments: string;
  description: string;
  entity: string;
  flags: string;
  graphql_name: string;
  subcommand: string;
  tags: string;
};

async function main(): Promise<void> {
  const sdl = await readFile(SCHEMA_PATH, "utf8");
  const schemaStats = await stat(SCHEMA_PATH);
  const inventory = await readInventory();
  const schema = buildASTSchema(parse(sdl), { assumeValidSDL: true });

  const connectionEntries = collectConnectionEntries(schema);
  const entityEntries = collectEntityEntries(schema);
  const relationshipEntries = collectRelationshipEntries(
    schema,
    entityEntries,
    connectionEntries,
  );

  const entityNames = new Set(entityEntries.map((entry) => entry.entity));
  const connectionNodeTypes = new Map(
    connectionEntries.map((entry) => [entry.connectionType, entry.nodeType]),
  );

  const queryEntries = collectOperationEntries({
    fields: schema.getQueryType()?.getFields() ?? {},
    kind: "query",
    entityNames,
    connectionNodeTypes,
    inventoryRows: indexInventoryRows(inventory.queries),
  });

  const mutationEntries = collectOperationEntries({
    fields: schema.getMutationType()?.getFields() ?? {},
    kind: "mutation",
    entityNames,
    connectionNodeTypes,
    inventoryRows: indexInventoryRows(inventory.mutations),
  });

  const metadata = buildMetadata({
    generatedAt: schemaStats.mtime.toISOString(),
    queryCount: queryEntries.length,
    mutationCount: mutationEntries.length,
    entityCount: entityEntries.length,
    relationshipCount: relationshipEntries.length,
    commandCount: queryEntries.length + mutationEntries.length + UTILITY_COMMAND_COUNT,
  });

  assertCountsMatchInventory(metadata, inventory.counts);

  await mkdir(GENERATED_DIR, { recursive: true });

  await Promise.all([
    writeRegistryModule({
      filename: "query-registry.ts",
      constName: "queryRegistry",
      typeName: "OperationRegistryEntry",
      metadata,
      entries: queryEntries,
    }),
    writeRegistryModule({
      filename: "mutation-registry.ts",
      constName: "mutationRegistry",
      typeName: "OperationRegistryEntry",
      metadata,
      entries: mutationEntries,
    }),
    writeRegistryModule({
      filename: "entity-registry.ts",
      constName: "entityRegistry",
      typeName: "EntityRegistryEntry",
      metadata,
      entries: entityEntries,
    }),
    writeRegistryModule({
      filename: "connection-registry.ts",
      constName: "connectionRegistry",
      typeName: "ConnectionRegistryEntry",
      metadata,
      entries: connectionEntries,
    }),
  ]);

  console.log(
    [
      `Generated query registry: ${queryEntries.length} entries`,
      `Generated mutation registry: ${mutationEntries.length} entries`,
      `Generated entity registry: ${entityEntries.length} entries`,
      `Generated connection registry: ${connectionEntries.length} entries`,
      `Derived relationship count: ${relationshipEntries.length}`,
    ].join("\n"),
  );
}

function buildMetadata(counts: {
  generatedAt: string;
  queryCount: number;
  mutationCount: number;
  entityCount: number;
  relationshipCount: number;
  commandCount: number;
}): GeneratedRegistryMetadata {
  const { generatedAt, ...rest } = counts;

  return {
    schemaPath: "src/generated/schema.graphql",
    schemaSourceUrl: DEFAULT_SCHEMA_SOURCE_URL,
    generatedAt,
    ...rest,
  };
}

async function readInventory(): Promise<{
  counts: {
    queries: number;
    mutations: number;
    entities: number;
    relationships: number;
    command_rows: number;
  };
  queries: InventoryOperationRow[];
  mutations: InventoryOperationRow[];
}> {
  const raw = await readFile(INVENTORY_PATH, "utf8");
  return JSON.parse(raw) as {
    counts: {
      queries: number;
      mutations: number;
      entities: number;
      relationships: number;
      command_rows: number;
    };
    queries: InventoryOperationRow[];
    mutations: InventoryOperationRow[];
  };
}

function assertCountsMatchInventory(
  metadata: GeneratedRegistryMetadata,
  expectedCounts: {
    queries: number;
    mutations: number;
    entities: number;
    relationships: number;
    command_rows: number;
  },
): void {
  const mismatches = [
    ["queries", metadata.queryCount, expectedCounts.queries],
    ["mutations", metadata.mutationCount, expectedCounts.mutations],
    ["entities", metadata.entityCount, expectedCounts.entities],
    ["relationships", metadata.relationshipCount, expectedCounts.relationships],
    ["command_rows", metadata.commandCount, expectedCounts.command_rows],
  ].filter(([, actual, expected]) => actual !== expected);

  if (mismatches.length === 0) {
    return;
  }

  const details = mismatches
    .map(([label, actual, expected]) => `${label}: expected ${expected}, received ${actual}`)
    .join("\n");

  throw new Error(`generated registry counts do not match .project inventory\n${details}`);
}

function collectOperationEntries({
  fields,
  kind,
  entityNames,
  connectionNodeTypes,
  inventoryRows,
}: {
  fields: Record<string, GraphQLField<unknown, unknown>>;
  kind: "query" | "mutation";
  entityNames: Set<string>;
  connectionNodeTypes: Map<string, string | null>;
  inventoryRows: Map<string, InventoryOperationRow>;
}): OperationRegistryEntry[] {
  return Object.values(fields)
    .map((field) =>
      createOperationEntry({
        field,
        kind,
        entityNames,
        connectionNodeTypes,
        inventoryRow: requireInventoryRow(inventoryRows, field.name),
      }),
    )
    .sort((left, right) => left.graphqlName.localeCompare(right.graphqlName));
}

function createOperationEntry({
  field,
  kind,
  entityNames,
  connectionNodeTypes,
  inventoryRow,
}: {
  field: GraphQLField<unknown, unknown>;
  kind: "query" | "mutation";
  entityNames: Set<string>;
  connectionNodeTypes: Map<string, string | null>;
  inventoryRow: InventoryOperationRow;
}): OperationRegistryEntry {
  const args = field.args.map(createArgumentDefinition);
  const returnType = createTypeRef(field.type);
  const namedReturnType = getNamedType(field.type);

  return {
    kind,
    graphqlName: field.name,
    cliCommand: `linear ${kind}`,
    cliSubcommand: inventoryRow.subcommand,
    entity:
      inventoryRow.entity || inferEntityName(namedReturnType, entityNames, connectionNodeTypes),
    description: inventoryRow.description,
    arguments: args,
    graphqlArgsSignature: renderArgumentsSignature(field.args),
    positionalArgumentsUsage: inventoryRow.arguments,
    flagUsage: splitFlagUsage(inventoryRow.flags),
    returnType,
    returnTypeSignature: renderTypeSignature(field.type),
    tags: parseInventoryTags(inventoryRow.tags),
    deprecatedReason: field.deprecationReason ?? null,
    sourceLine: field.astNode?.loc?.startToken.line ?? null,
    defaultSelectionStrategy: inferDefaultSelectionStrategy(
      namedReturnType,
      entityNames,
      connectionNodeTypes,
    ),
  };
}

function createArgumentDefinition(argument: GraphQLArgument): RegistryArgumentDefinition {
  const namedType = getNamedType(argument.type);
  const kind = inferArgumentKind(argument.type, namedType, argument.name);
  const isId = argument.name === "id";

  return {
    graphqlName: argument.name,
    cliFlag: isId ? null : `--${toKebabCase(argument.name).replace(/^_+/, "")}`,
    positionalName: isId ? "id" : null,
    description: argument.description ?? "",
    kind,
    typeRef: createTypeRef(argument.type),
    required: isNonNullType(argument.type),
    repeatable: false,
  };
}

function inferArgumentKind(
  type: GraphQLType,
  namedType: GraphQLNamedType,
  argumentName: string,
): RegistryArgumentKind {
  if (argumentName === "id") {
    return "id";
  }

  if (isListType(type) || (isNonNullType(type) && isListType(type.ofType))) {
    return "list";
  }

  if (isEnumType(namedType)) {
    return "enum";
  }

  if (isInputObjectType(namedType)) {
    return "input";
  }

  if (isScalarType(namedType) && /json/i.test(namedType.name)) {
    return "json";
  }

  return "scalar";
}

function inferDefaultSelectionStrategy(
  namedType: GraphQLNamedType,
  entityNames: Set<string>,
  connectionNodeTypes: Map<string, string | null>,
): DefaultSelectionStrategy {
  if (connectionNodeTypes.has(namedType.name)) {
    return "connection";
  }

  if (entityNames.has(namedType.name)) {
    return "entity";
  }

  if (isObjectType(namedType) && namedType.getFields().success) {
    return "payload";
  }

  if (isScalarType(namedType) || isEnumType(namedType)) {
    return "scalar";
  }

  return "unknown";
}

function collectEntityEntries(schema: ReturnType<typeof buildASTSchema>): EntityRegistryEntry[] {
  return Object.values(schema.getTypeMap())
    .filter((type): type is GraphQLObjectType | GraphQLInterfaceType => {
      if (type.name.startsWith("__")) {
        return false;
      }

      if (!isObjectType(type) && !isInterfaceType(type)) {
        return false;
      }

      return type.name !== "Node" && getImplementedInterfaces(type).includes("Node");
    })
    .map(
      (type): EntityRegistryEntry => ({
        entity: type.name,
        kind: isInterfaceType(type) ? "INTERFACE" : "OBJECT",
        implements: getImplementedInterfaces(type),
        description: type.description ?? "",
        tags: inferTags(type.description ?? "", null),
        sourceLine: type.astNode?.loc?.startToken.line ?? null,
      }),
    )
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

function collectConnectionEntries(
  schema: ReturnType<typeof buildASTSchema>,
): ConnectionRegistryEntry[] {
  return Object.values(schema.getTypeMap())
    .filter((type): type is GraphQLObjectType => {
      if (!isObjectType(type) || type.name.startsWith("__")) {
        return false;
      }

      return type.name.endsWith("Connection");
    })
    .map((type) => {
      const fields = type.getFields();
      const nodesField = fields.nodes;
      const edgesField = fields.edges;
      const pageInfoField = fields.pageInfo;
      const countField = fields.count ?? fields.totalCount ?? null;

      const edgeType = edgesField ? getNamedType(edgesField.type).name : null;
      const nodeType = nodesField
        ? getNamedType(nodesField.type).name
        : inferNodeTypeFromEdge(schema, edgeType);

      return {
        connectionType: type.name,
        edgeType,
        nodeType,
        pageInfoFieldName: pageInfoField?.name ?? null,
        totalCountFieldName: countField?.name ?? null,
      };
    })
    .sort((left, right) => left.connectionType.localeCompare(right.connectionType));
}

function collectRelationshipEntries(
  schema: ReturnType<typeof buildASTSchema>,
  entityEntries: EntityRegistryEntry[],
  connectionEntries: ConnectionRegistryEntry[],
): RelationshipRegistryEntry[] {
  const entityNames = new Set(entityEntries.map((entry) => entry.entity));
  const connectionNodeTypes = new Map(
    connectionEntries.map((entry) => [entry.connectionType, entry.nodeType]),
  );

  return Object.values(schema.getTypeMap())
    .filter((type): type is GraphQLObjectType | GraphQLInterfaceType => {
      return (
        (isObjectType(type) || isInterfaceType(type)) &&
        entityNames.has(type.name) &&
        !type.name.startsWith("__")
      );
    })
    .flatMap((type) =>
      Object.values(type.getFields())
        .map((field) => {
          const namedType = getNamedType(field.type);

          if (entityNames.has(namedType.name)) {
            return {
              sourceEntity: type.name,
              relationField: field.name,
              targetEntity: namedType.name,
              relationKind: "direct" as const,
              description: field.description ?? "",
              graphqlArgsSignature: renderArgumentsSignature(field.args),
            };
          }

          const connectionNodeType = connectionNodeTypes.get(namedType.name);

          if (connectionNodeType && entityNames.has(connectionNodeType)) {
            return {
              sourceEntity: type.name,
              relationField: field.name,
              targetEntity: connectionNodeType,
              relationKind: "connection" as const,
              description: field.description ?? "",
              graphqlArgsSignature: renderArgumentsSignature(field.args),
            };
          }

          return null;
        })
        .filter((entry): entry is RelationshipRegistryEntry => entry !== null),
    )
    .sort((left, right) => {
      return (
        left.sourceEntity.localeCompare(right.sourceEntity) ||
        left.relationField.localeCompare(right.relationField)
      );
    });
}

async function writeRegistryModule<TEntry>({
  filename,
  constName,
  typeName,
  metadata,
  entries,
}: {
  filename: string;
  constName: string;
  typeName: string;
  metadata: GeneratedRegistryMetadata;
  entries: TEntry[];
}): Promise<void> {
  const outputPath = path.join(GENERATED_DIR, filename);
  const data = {
    metadata,
    entries,
  };

  const source = [
    "// This file is generated by scripts/generate-registry.ts. Do not edit manually.",
    `import type { GeneratedRegistry, ${typeName} } from "../core/registry/types.js";`,
    "",
    `export const ${constName}: GeneratedRegistry<${typeName}> = ${JSON.stringify(
      data,
      null,
      2,
    )};`,
    "",
    `export default ${constName};`,
    "",
  ].join("\n");

  await writeFile(outputPath, source, "utf8");
}

function createTypeRef(type: GraphQLType): GraphQLTypeRef {
  if (isNonNullType(type)) {
    return {
      kind: "NON_NULL",
      name: null,
      ofType: createTypeRef(type.ofType),
    };
  }

  if (isListType(type)) {
    return {
      kind: "LIST",
      name: null,
      ofType: createTypeRef(type.ofType),
    };
  }

  return {
    kind: "NAMED",
    name: type.name,
    ofType: null,
  };
}

function renderTypeSignature(type: GraphQLType): string {
  if (isNonNullType(type)) {
    return `${renderTypeSignature(type.ofType)}!`;
  }

  if (isListType(type)) {
    return `[${renderTypeSignature(type.ofType)}]`;
  }

  return type.name;
}

function renderArgumentsSignature(arguments_: readonly GraphQLArgument[]): string {
  return arguments_
    .map((argument) => `${argument.name}: ${renderTypeSignature(argument.type)}`)
    .join(", ");
}

function inferEntityName(
  namedType: GraphQLNamedType,
  entityNames: Set<string>,
  connectionNodeTypes: Map<string, string | null>,
): string {
  if (entityNames.has(namedType.name)) {
    return namedType.name;
  }

  const connectionNodeType = connectionNodeTypes.get(namedType.name);

  if (connectionNodeType && entityNames.has(connectionNodeType)) {
    return connectionNodeType;
  }

  if (isObjectType(namedType) && namedType.getFields().success) {
    for (const field of Object.values(namedType.getFields())) {
      if (field.name === "success" || field.name === "lastSyncId") {
        continue;
      }

      const childType = getNamedType(field.type);

      if (entityNames.has(childType.name)) {
        return childType.name;
      }

      const childConnectionNodeType = connectionNodeTypes.get(childType.name);

      if (childConnectionNodeType && entityNames.has(childConnectionNodeType)) {
        return childConnectionNodeType;
      }
    }
  }

  return connectionNodeTypes.get(namedType.name) ?? namedType.name;
}

function parseInventoryTags(inventoryTags: string): RegistryTag[] {
  return inventoryTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean) as RegistryTag[];
}

function inferTags(description: string, deprecatedReason: string | null): RegistryTag[] {
  const tags = new Set<RegistryTag>();

  if (deprecatedReason) {
    tags.add("deprecated");
  }

  if (/\[(?:internal)\]/i.test(description)) {
    tags.add("internal");
  }

  if (/\[(?:alpha)\]/i.test(description)) {
    tags.add("alpha");
  }

  if (/\[(?:deprecated)\]/i.test(description)) {
    tags.add("deprecated");
  }

  return [...tags].sort();
}

function splitFlagUsage(flags: string): string[] {
  if (flags.length === 0) {
    return [];
  }

  return flags
    .split(",")
    .map((flag) => flag.trim())
    .filter((flag) => flag !== "--select <fields|@file>" && flag !== "--format <human|json>");
}

function indexInventoryRows(rows: InventoryOperationRow[]): Map<string, InventoryOperationRow> {
  return new Map(rows.map((row) => [row.graphql_name, row]));
}

function requireInventoryRow(
  inventoryRows: Map<string, InventoryOperationRow>,
  graphqlName: string,
): InventoryOperationRow {
  const row = inventoryRows.get(graphqlName);

  if (!row) {
    throw new Error(`missing inventory row for GraphQL operation ${graphqlName}`);
  }

  return row;
}

function getImplementedInterfaces(type: GraphQLObjectType | GraphQLInterfaceType): string[] {
  if (!("getInterfaces" in type) || typeof type.getInterfaces !== "function") {
    return [];
  }

  return type
    .getInterfaces()
    .map((interfaceType) => interfaceType.name)
    .sort((left, right) => left.localeCompare(right));
}

function inferNodeTypeFromEdge(
  schema: ReturnType<typeof buildASTSchema>,
  edgeTypeName: string | null,
): string | null {
  if (!edgeTypeName) {
    return null;
  }

  const edgeType = schema.getType(edgeTypeName);

  if (!edgeType || !isObjectType(edgeType)) {
    return null;
  }

  const nodeField = edgeType.getFields().node;

  return nodeField ? getNamedType(nodeField.type).name : null;
}

function toKebabCase(value: string): string {
  return value
    .replace(/^_+/, "")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

await main();
