# linear-cli

`linear-cli` is a schema-driven command-line wrapper for the Linear GraphQL API.

The implementation is based on the source inventories under `.project/`:

- 146 query root fields
- 343 mutation root fields
- 4 utility command groups

The goal is full generated coverage rather than a hand-maintained subset. Query and mutation commands will be derived from the Linear schema so the CLI surface stays aligned with the published API.

## Planned architecture

- thin root CLI built with `commander`
- generated operation registries from the Linear schema
- shared runtime for auth, config, transport, selection building, pagination, and output
- utility command groups for `auth`, `config`, `graphql raw`, and `upload`

## Local requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Setup

```bash
pnpm install
pnpm check
```

Schema generation is wired into the repository layout already, but the fetch and generation scripts will be implemented in the next work items.

## Scripts

- `pnpm dev` runs the CLI entrypoint directly from `src/`
- `pnpm check` runs the TypeScript typecheck without emitting build output
- `pnpm build` compiles the project into `dist/`
- `pnpm fetch:schema` will fetch or refresh the vendored Linear schema
- `pnpm generate` will regenerate the CLI registries from the schema
- `pnpm test` runs the automated test suite
- `pnpm test:watch` runs Vitest in watch mode

## Repository layout

```text
.
├── src/
│   ├── bin/          CLI entrypoint
│   ├── cli/          root program and shared option wiring
│   ├── commands/     command implementations and generated registration hooks
│   ├── core/         auth, config, GraphQL, pagination, output, runtime
│   ├── generated/    vendored schema and generated registries
│   └── types/        shared CLI types
├── scripts/          schema fetch and registry generation scripts
├── test/             unit, integration, and fixture coverage
└── .project/         local planning and source specification inputs
```

## Development workflow

The project is intentionally being built in small commit-sized steps:

1. scaffold the repo and install dependencies
2. vendor the schema and generate registries
3. build the runtime layers
4. wire generated query and mutation commands
5. add utility commands, output modes, and tests

The local execution checklist lives in `.project/todo.md`. That file is intentionally local-only; git commits contain the implementation changes themselves.

## Usage

### Authentication

Store a personal API key for the default profile:

```bash
linear auth login-api-key --api-key lin_api_key_here
```

Run an OAuth login flow for a named profile:

```bash
linear --profile work auth login-oauth --client-id linear_oauth_client_id --scopes read,write
```

Check the stored auth state for the active profile:

```bash
linear auth status
linear --format json auth status
```

### Raw GraphQL

Execute a raw GraphQL document inline:

```bash
linear graphql raw \
  --query 'query ViewerQuery { viewer { id name } }' \
  --operation-name ViewerQuery
```

Load the document and variables from files:

```bash
linear --format json graphql raw \
  --query @./query.graphql \
  --variables @./variables.json \
  --operation-name ViewerQuery
```

### Generated commands

Execute a generated query with the default selection:

```bash
linear query viewer
```

Override the selection set for a specific query:

```bash
linear query issue sample-id --select 'id identifier title state { name }'
```

Execute a generated mutation with inline JSON input:

```bash
linear mutation issue-create \
  --input '{"teamId":"team_123","title":"Example issue"}' \
  --select 'success issue { id identifier title }'
```

### Pagination

Run a single page query:

```bash
linear query issues --first 20
```

Fetch all forward pages for a connection query:

```bash
linear query issues --all
linear --verbose query projects --all --select 'nodes { id name } pageInfo { hasNextPage endCursor }'
```

Backward pagination is supported with `--last` and `--before`, but it cannot be combined with `--all`.

### JSON input and `@file`

Flags that accept JSON, such as `--input`, `--filter`, `--variables`, `--metadata`, and `--select`, can read either inline values or file references.

```bash
linear mutation project-create --input @./project-create.json
linear query issues --filter @./issue-filter.json --select @./issue-selection.graphql
```

### Upload helpers

Upload a file and print the resulting asset URL:

```bash
linear upload file ./screenshot.png
```

Override inferred metadata or request JSON output:

```bash
linear --format json upload file ./report.pdf \
  --content-type application/pdf \
  --filename quarterly-report.pdf \
  --metadata '{"source":"finance"}'
```

Delete an uploaded asset by URL:

```bash
linear upload delete https://assets.example.com/path/to/file.png
```

## Registry regeneration

The generated registries under `src/generated/` are derived from Linear's published schema SDL. Do not edit those files by hand.

Refresh the vendored schema and regenerate the registries with:

```bash
pnpm fetch:schema
pnpm generate
```

When the schema changes:

1. refresh `src/generated/schema.graphql`
2. regenerate the query, mutation, entity, and connection registries
3. rerun the test suite to catch command-surface drift and behavior regressions
4. inspect any inventory-count failures before updating expectations

Maintenance expectations:

- `scripts/fetch-schema.ts` is the only supported way to refresh the vendored schema
- `scripts/generate-registry.ts` owns the generated command metadata and exact inventory counts
- `test/unit/command-surface.test.ts` and `test/integration/command-surface-smoke.test.ts` should stay green after any regeneration
- if Linear adds or removes operations, update the local planning artifacts in `.project/` as needed, but keep `.project/` itself uncommitted
