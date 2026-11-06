# Contributing

## Dev setup

```sh
pnpm install
pnpm sync:clearurls   # populate packages/clearurls/data/
pnpm build
pnpm test
```

## Layout

This is a pnpm + changesets monorepo.

```
packages/
  core/        @url-sanitize/core         pure algorithm, zero deps
  clearurls/   @url-sanitize/clearurls    ClearURLs catalog adapter + bundled data
  cli/         @url-sanitize/cli          command-line tool
sources/
  clearurls/   sync script + test fixtures
docs/          public docs (threat model, license, roadmap)
```

## Workflow

1. Open an issue first for non-trivial changes.
2. Branch from `main`.
3. Run `pnpm changeset` to declare a version bump for any package you change.
4. Open PR. CI must pass (typecheck + lint + test + build).

## Adding a rule fixture

Upstream rule sets change daily. To pin a behavior, add it to the shared
conformance corpus, which both the TypeScript and Rust engines must pass:

1. Add a line to `conformance/inputs/vectors.jsonl` with an `id`, a `note` and the `input` URL (plus `options` if needed)
2. Run `pnpm build:conformance`: the TypeScript engine writes the expected result to `conformance/vectors.jsonl`
3. Check that expected result, then commit both files and open a PR

## Reporting a broken URL

Use the `broken-url.yml` issue template. Include: input URL, expected output, actual output, `@url-sanitize/clearurls` version (from `metadata.json`).

## Scope

See [docs/non-goals.md](docs/non-goals.md). PRs that add browser-extension UI, HTTP interception, DNS blocking, or telemetry will be closed.
