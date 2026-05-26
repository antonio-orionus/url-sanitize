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

ClearURLs ruleset changes upstream. To pin a behavior:

1. Add a fixture under `sources/clearurls/fixtures/<provider>.json` with input + expected output URLs
2. Reference it in `packages/core/test/sanitize.test.ts`
3. PR

## Reporting a broken URL

Use the `broken-url.yml` issue template. Include: input URL, expected output, actual output, `@url-sanitize/clearurls` version (from `metadata.json`).

## Scope

See [docs/non-goals.md](docs/non-goals.md). PRs that add browser-extension UI, HTTP interception, DNS blocking, or telemetry will be closed.
