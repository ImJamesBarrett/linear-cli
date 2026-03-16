import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildASTSchema,
  isInterfaceType,
  isObjectType,
  parse,
  type GraphQLNamedType,
  type GraphQLSchema,
} from "graphql";

import { connectionRegistry } from "../../generated/connection-registry.js";
import { entityRegistry } from "../../generated/entity-registry.js";
import type { OperationRegistryEntry } from "../registry/types.js";

const DEFAULT_PAGE_INFO_SELECTION =
  "pageInfo { hasNextPage hasPreviousPage startCursor endCursor }";
const ENTITY_PRIMARY_FIELDS = ["identifier", "name", "title"];
const ENTITY_TIMESTAMP_FIELDS = ["createdAt", "updatedAt"];
const PAYLOAD_META_FIELDS = ["success", "lastSyncId"];

let cachedSchema: GraphQLSchema | null = null;

export function buildDefaultSelection(entry: OperationRegistryEntry): string {
  const schema = getSchema();
  const typeName = unwrapNamedTypeName(entry.returnTypeSignature);

  switch (entry.defaultSelectionStrategy) {
    case "connection":
      return buildConnectionSelection(schema, typeName);
    case "entity":
      return buildEntitySelection(schema, entry.entity);
    case "payload":
      return buildPayloadSelection(schema, typeName);
    case "scalar":
      return "";
    case "unknown":
    default:
      return buildObjectSelection(schema, typeName);
  }
}

function buildConnectionSelection(schema: GraphQLSchema, connectionTypeName: string): string {
  const connectionEntry = connectionRegistry.entries.find(
    (entry) => entry.connectionType === connectionTypeName,
  );
  const selectionParts: string[] = [];

  if (connectionEntry?.nodeType) {
    selectionParts.push(`nodes { ${buildEntitySelection(schema, connectionEntry.nodeType)} }`);
  }

  selectionParts.push(DEFAULT_PAGE_INFO_SELECTION);

  return selectionParts.join(" ");
}

function buildPayloadSelection(schema: GraphQLSchema, typeName: string): string {
  const type = schema.getType(typeName);

  if (!type || (!isObjectType(type) && !isInterfaceType(type))) {
    return "";
  }

  const fields = type.getFields();
  const selectionParts: string[] = [];

  for (const fieldName of PAYLOAD_META_FIELDS) {
    if (fields[fieldName]) {
      selectionParts.push(fieldName);
    }
  }

  const nestedField = Object.values(fields).find((field) => !PAYLOAD_META_FIELDS.includes(field.name));

  if (nestedField) {
    const nestedTypeName = unwrapNamedTypeName(String(nestedField.type));
    const nestedSelection = buildSelectionForNamedType(schema, nestedTypeName);

    if (nestedSelection) {
      selectionParts.push(`${nestedField.name} { ${nestedSelection} }`);
    } else {
      selectionParts.push(nestedField.name);
    }
  }

  return selectionParts.join(" ");
}

function buildObjectSelection(schema: GraphQLSchema, typeName: string): string {
  if (isEntityType(typeName)) {
    return buildEntitySelection(schema, typeName);
  }

  const type = schema.getType(typeName);

  if (!type || (!isObjectType(type) && !isInterfaceType(type))) {
    return "";
  }

  const fields = type.getFields();
  const preferredField = Object.values(fields).find((field) => {
    const nestedTypeName = unwrapNamedTypeName(String(field.type));
    return isEntityType(nestedTypeName);
  });

  if (preferredField) {
    const nestedTypeName = unwrapNamedTypeName(String(preferredField.type));
    return `${preferredField.name} { ${buildEntitySelection(schema, nestedTypeName)} }`;
  }

  return Object.keys(fields).slice(0, 3).join(" ");
}

function buildEntitySelection(schema: GraphQLSchema, typeName: string): string {
  const type = schema.getType(typeName);

  if (!type || (!isObjectType(type) && !isInterfaceType(type))) {
    return "id";
  }

  const fields = type.getFields();
  const selection = new Set<string>();

  if (fields.id) {
    selection.add("id");
  }

  for (const fieldName of ENTITY_PRIMARY_FIELDS) {
    if (fields[fieldName]) {
      selection.add(fieldName);
      break;
    }
  }

  if (fields.url) {
    selection.add("url");
  }

  for (const fieldName of ENTITY_TIMESTAMP_FIELDS) {
    if (fields[fieldName]) {
      selection.add(fieldName);
    }
  }

  if (selection.size === 0) {
    selection.add(Object.keys(fields)[0] ?? "id");
  }

  return [...selection].join(" ");
}

function buildSelectionForNamedType(schema: GraphQLSchema, typeName: string): string {
  if (connectionRegistry.entries.some((entry) => entry.connectionType === typeName)) {
    return buildConnectionSelection(schema, typeName);
  }

  if (isEntityType(typeName)) {
    return buildEntitySelection(schema, typeName);
  }

  return buildObjectSelection(schema, typeName);
}

function isEntityType(typeName: string): boolean {
  return entityRegistry.entries.some((entry) => entry.entity === typeName);
}

function getSchema(): GraphQLSchema {
  if (cachedSchema) {
    return cachedSchema;
  }

  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../generated/schema.graphql",
  );
  const sdl = readFileSync(schemaPath, "utf8");
  cachedSchema = buildASTSchema(parse(sdl), { assumeValidSDL: true });

  return cachedSchema;
}

function unwrapNamedTypeName(typeSignature: string): string {
  return typeSignature.replace(/[!\[\]]/g, "");
}

