## Shell command wrapper

This repo prefers `rtk` as a token-optimized shell command proxy.

Bootstrap exception: before using `rtk`, check whether it is available:

```bash
command -v rtk
```

If available, prefix repo shell commands with `rtk`. If unavailable, run commands directly and mention that `rtk` was not found.

@/home/anton/projects/url-sanitize/RTK.md

# url-sanitize — agent context

ClearURLs-compatible URL tracking cleanup toolkit. Removes tracking parameters and unwraps tracking redirects from TypeScript, Rust, npm CLI, native binaries, and Python wrapper surfaces.

## Package layout

```
packages/
  core/        @url-sanitize/core        pure algorithm, zero deps, MIT
  clearurls/   @url-sanitize/clearurls   ClearURLs catalog + pre-compiled sanitize(), LGPL-3.0 data
  cli/         @url-sanitize/cli         pure TypeScript npm CLI, MIT
  fetch/       @url-sanitize/fetch       runtime ClearURLs fetch + hash pinning, MIT
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

Pre-push hook runs: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `cargo package -p url-sanitize-core --allow-dirty`.

## Key conventions

- **Linter/formatter**: Biome — not ESLint/Prettier. Run `pnpm lint` to check, `pnpm format` to fix.
- **Build**: tsup (ESM only, `.d.ts` emitted). `dist/` is gitignored, included in npm via `"files"`.
- **Test runner**: vitest. Single test file: `bunx vitest run packages/core/test/sanitize.test.ts`
- **Imports**: must be alphabetically ordered (Biome enforces). Use `.js` extensions in source imports.
- **Versions**: npm packages, Rust workspace, and PyPI wrapper version-bump together on every release.
- **Roadmap**: `docs/roadmap.md` is canonical. Do not recreate `PLAN.md`.
- **npm native packages**: intentionally not used in v0.2. They create one package/trusted-publisher setup per platform. Keep npm CLI pure TypeScript unless this tradeoff is explicitly reopened.

## Publishing

Publish is automated from version-bump PRs and `v*` tags:

- npm packages use npm trusted publishing (OIDC).
- crates.io uses `rust-lang/crates-io-auth-action` trusted publishing.
- PyPI uses trusted publishing with the `pypi` GitHub environment.
- GitHub Releases receive native archives, SHA256SUMS, and installer scripts for Linux x64/ARM64, macOS Apple Silicon/Intel, and Windows x64.
- Homebrew and Scoop metadata are rendered from the published `SHA256SUMS` and pushed to the configured tap/bucket repos.
- Public release smoke verifies npm, crates.io, PyPI, GitHub Release assets, Homebrew, and Scoop after publishing.

No long-lived registry token should be required after trusted publishers are configured.

> **First publish of a NEW package needs a manual bootstrap.** OIDC trusted publishing cannot create a package name that has zero published versions — the trusted-publisher binding is per-package and does not exist yet. The automated release will fail with `npm error 404 ... could not be found or you do not have permission` (npm) or the equivalent on crates.io/PyPI. Before relying on CI/CD for a brand-new package, publish v1 manually once, then configure its trusted publisher on the registry. See [Adding a new package](#adding-a-new-package).
>
> After the manual publish, registry propagation lags ~minutes. Re-running CI too soon makes the "already published; skipping" guard miss and retry the publish, which then fails with `403 cannot publish over the previously published versions`. Wait for propagation, then re-run.

```bash
# bump versions in packages/*/package.json, Cargo.toml, Cargo.lock, pyproject.toml
git commit -m "release: vX.Y.Z"
git push
# After main CI passes, .github/workflows/auto-tag.yml creates vX.Y.Z and dispatches release.yml.
```

`release.yml` also supports manual dispatch from an existing `v*` tag for recovery, but normal releases should go through the version-bump PR path. Tags pushed with `GITHUB_TOKEN` do not trigger another tag-push workflow automatically, so `auto-tag.yml` explicitly dispatches `release.yml`.

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
6. **Bootstrap the first publish manually — do this BEFORE the release CI runs for this package.** OIDC trusted publishing cannot create a name with zero published versions (see [Publishing](#publishing)). Once:

   ```bash
   pnpm build
   npm login                                                          # account with @url-sanitize scope access
   pnpm --filter "@url-sanitize/<name>" pack --pack-destination "$PWD/npm-packages"
   npm publish "$PWD"/npm-packages/url-sanitize-<name>-*.tgz --access public
   ```

   Then on npmjs.org open the package → **Settings → Trusted Publisher** and add the GitHub Actions publisher (repo `antonio-orionus/url-sanitize`, workflow `release.yml`) to match the existing packages. After that, every release publishes via OIDC automatically.

## Non-goals

No browser extension UI, HTTP interception, DNS blocking, or telemetry. See `docs/non-goals.md`.
