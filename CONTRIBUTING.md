# Contributing

## Dev setup

```sh
pnpm install
pnpm build
pnpm test
cargo test --workspace
```

## Layout

This is a pnpm workspace plus a Cargo workspace.

```
packages/
  core/        @url-sanitize/core         pure algorithm, zero deps
  clearurls/   @url-sanitize/clearurls    ClearURLs catalog adapter + bundled data
  adguard/  brave/  firefox/              the other upstream sources
  merged/      @url-sanitize/merged       all four sources in one catalog
  cli/         @url-sanitize/cli          command-line tool
  fetch/       @url-sanitize/fetch        runtime ClearURLs fetch + hash pinning
crates/        Rust engine and native CLI
python/        PyPI wrapper around the native CLI
sources/       upstream sync scripts (pnpm sync:sources)
conformance/   behavior contract both engines must pass
docs/          public docs (threat model, license, roadmap)
```

Bundled rule data is committed; you don't need to sync before building.

## Workflow

1. Open an issue first for non-trivial changes.
2. Branch from `main`.
3. Open PR. CI must pass (typecheck + lint + test + build, plus the Rust checks).

Don't bump versions in your PR. Every package, crate and the PyPI wrapper share
one version, which the maintainer bumps with `scripts/bump-version.mjs` in a
`release: vX.Y.Z` PR.

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
