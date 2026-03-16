# linear-cli

`linear-cli` is a schema-driven command-line client for the Linear GraphQL API.

It gives you two ways to work:

- grouped commands for day-to-day use, such as `linear issue create` and `linear project list`
- the full generated GraphQL surface under `linear query ...` and `linear mutation ...`

The generated command surface is derived from the Linear schema, so the CLI can be refreshed when the API changes without hand-maintaining hundreds of commands.

## Status

This repository is public, but the package is not currently published to npm. Use it from source.

## Requirements

- Node.js 22, 23, or 24
- pnpm 10+

## Install

```bash
git clone git@github.com:ImJamesBarrett/linear-cli.git
cd linear-cli
pnpm install
pnpm build
```

Run from source during development:

```bash
pnpm dev -- --help
```

Run the built CLI:

```bash
node dist/bin/linear.js --help
```

## Authentication

The simplest setup is a Linear API key.

Store it once:

```bash
linear auth login-api-key --api-key <your-linear-api-key>
```

Check the current auth state:

```bash
linear auth status
```

Credentials are stored in the OS keychain through `keytar` when available. Plaintext fallback exists, but only if explicitly enabled.

## Command Model

### 1. Grouped aliases

These are the main human-facing commands.

Examples:

```bash
linear issue get <issue-id>
linear issue list --first 20
linear issue create --input '{"teamId":"<team-id>","title":"Example issue"}'
linear issue update <issue-id> --input '{"title":"Renamed issue"}'
linear project get <project-id>
linear project list
linear release list
```

Explore a command group:

```bash
linear issue --help
linear project --help
linear organization --help
```

### 2. Full generated surface

The full schema-derived command surface is still available:

```bash
linear query issue <issue-id>
linear query issues --first 20
linear mutation issue-create --input '{"teamId":"<team-id>","title":"Example issue"}'
```

This is the source-of-truth surface. The grouped aliases sit on top of it.

### 3. Raw GraphQL

For anything that does not fit the generated or grouped surfaces:

```bash
linear graphql raw \
  --query 'query ViewerQuery { viewer { id name } }' \
  --operation-name ViewerQuery
```

You can also load the query and variables from files:

```bash
linear --format json graphql raw \
  --query @./query.graphql \
  --variables @./variables.json \
  --operation-name ViewerQuery
```

## Common Examples

Create an issue:

```bash
linear issue create \
  --input '{"teamId":"<team-id>","title":"Example issue"}' \
  --select 'success issue { id identifier title url }'
```

Get one issue:

```bash
linear issue get <issue-id> \
  --select 'id identifier title description url state { name }'
```

List issues:

```bash
linear issue list --first 20
linear issue list --all --select 'nodes { id identifier title } pageInfo { hasNextPage endCursor }'
```

Update an issue:

```bash
linear issue update <issue-id> \
  --input '{"title":"Updated title"}' \
  --select 'success issue { id identifier title }'
```

Upload a file:

```bash
linear upload file ./screenshot.png
```

Delete an uploaded asset:

```bash
linear upload delete https://assets.example.com/path/to/file.png
```

## JSON Input and `@file`

Flags that accept JSON can read either inline JSON or a file reference.

Examples:

```bash
linear issue create --input @./issue-create.json
linear issue list --filter @./issue-filter.json
linear graphql raw --variables @./variables.json
```

## Output Modes

Human output is the default.

For machine-readable output:

```bash
linear --format json issue get <issue-id>
linear --format json auth status
```

When `--format json` is set, failure output is also emitted as JSON.

## Global Flags

Available on the root command:

- `--profile <name>`
- `--format <human|json>`
- `--header <name:value>`
- `--public-file-urls-expire-in <seconds>`
- `--verbose`
- `--allow-partial-data`

## Keeping the CLI Up to Date

Refresh the vendored schema and regenerate the command registries:

```bash
pnpm fetch:schema
pnpm generate
pnpm check
pnpm test
```

That updates the generated query and mutation surface. The grouped aliases are derived from the generated registries.

## Development

Useful scripts:

- `pnpm dev`
- `pnpm build`
- `pnpm check`
- `pnpm test`
- `pnpm test:watch`
- `pnpm fetch:schema`
- `pnpm generate`
