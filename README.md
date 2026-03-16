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
