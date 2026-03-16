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
- npm 11 or newer

## Current status

The repository scaffold is in place. Dependency installation, schema generation, and the runtime implementation are tracked in `.project/todo.md`.

