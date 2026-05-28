# url-sanitize — agent context

ClearURLs-compatible URL tracking cleanup toolkit. Removes tracking parameters and unwraps tracking redirects from TypeScript, Rust, npm CLI, native binaries, and Python wrapper surfaces.

## Package layout

```
packages/
  core/        @url-sanitize/core        pure algorithm, zero deps, MIT
  clearurls/   @url-sanitize/clearurls   ClearURLs catalog + pre-compiled sanitize(), LGPL-3.0 data
  cli/         @url-sanitize/cli         pure TypeScript npm CLI, MIT
crates/
  url-sanitize-core/                    Rust implementation
  url-sanitize/                         native CLI with embedded catalog
python/
  url_sanitize/                         PyPI wrapper around native CLI / PATH binary
sources/
  clearurls/   upstream sync script (pnpm sync:clearurls)
docs/          threat model, license model, roadmap, compat notes
```

## Common workflows

```bash
pnpm install                  # install all workspace deps
pnpm sync:clearurls           # fetch + SHA256-verify upstream rules → packages/clearurls/data/
pnpm build                    # tsup build all packages (must run before typecheck)
pnpm test                     # vitest run
pnpm lint                     # biome check . (also enforces import order)
pnpm format                   # biome format --write .
pnpm typecheck                # tsc --noEmit across all packages
cargo fmt --all --check       # Rust formatting check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace        # Rust conformance + unit tests
cargo package -p url-sanitize-core
cargo package -p url-sanitize
```

Pre-push hook runs: `pnpm build && pnpm lint && pnpm test`

## Key conventions

- **Linter/formatter**: Biome — not ESLint/Prettier. Run `pnpm lint` to check, `pnpm format` to fix.
- **Build**: tsup (ESM only, `.d.ts` emitted). `dist/` is gitignored, included in npm via `"files"`.
- **Test runner**: vitest. Single test file: `bunx vitest run packages/core/test/sanitize.test.ts`
- **Imports**: must be alphabetically ordered (Biome enforces). Use `.js` extensions in source imports.
- **Versions**: npm packages, Rust workspace, and PyPI wrapper version-bump together on every release.
- **Roadmap**: `docs/roadmap.md` is canonical. Do not recreate `PLAN.md`.
- **npm native packages**: intentionally not used in v0.2. They create one package/trusted-publisher setup per platform. Keep npm CLI pure TypeScript unless this tradeoff is explicitly reopened.

## Publishing

Publish is fully automated from `v*` tags:

- npm packages use npm trusted publishing (OIDC).
- crates.io uses `rust-lang/crates-io-auth-action` trusted publishing.
- PyPI uses trusted publishing with the `pypi` GitHub environment.
- GitHub Releases receive native archives, SHA256SUMS, and installer scripts.

No long-lived registry token should be required after trusted publishers are configured.

```bash
# bump versions in packages/*/package.json, Cargo.toml, pyproject.toml
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "release X.Y.Z"
git push --follow-tags
# .github/workflows/release.yml publishes npm, crates, PyPI, and native assets
```

## Architecture

`compileSanitizer(catalog, opts?) → Sanitizer` — factory pattern. Compiles all RegExp at factory time. Call once at module init, reuse the returned function.

`@url-sanitize/clearurls` exports `sanitize` (pre-compiled with default options) for one-import usage:
```ts
import { sanitize } from '@url-sanitize/clearurls';
```

Result is a discriminated union: `{ kind: 'unchanged' } | { kind: 'cleaned', strippedParams, matchedRules } | { kind: 'redirected', via } | { kind: 'blocked', via }`

## Daily sync

`.github/workflows/sync-clearurls.yml` runs at 04:17 UTC, opens a PR on change, auto-merges via squash. No manual action needed.

## Adding a new package

1. Create `packages/<name>/` with `package.json` (`"name": "@url-sanitize/<name>"`, `"publishConfig": { "access": "public" }`)
2. Add `tsconfig.json` extending `../../tsconfig.base.json`
3. Add `"build"` script using tsup
4. Add `"files": ["dist"]`
5. `pnpm install` to link workspace

## Non-goals

No browser extension UI, HTTP interception, DNS blocking, or telemetry. See `docs/non-goals.md`.
