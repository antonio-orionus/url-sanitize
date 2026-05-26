# url-sanitize — agent context

TypeScript URL sanitization toolkit. MIT-licensed engine, daily-synced ClearURLs rules, explainable discriminated-union results.

## Package layout

```
packages/
  core/        @url-sanitize/core        pure algorithm, zero deps, MIT
  clearurls/   @url-sanitize/clearurls   ClearURLs catalog + pre-compiled sanitize(), LGPL-3.0 data
  cli/         @url-sanitize/cli         CLI wrapper, MIT
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
```

Pre-push hook runs: `pnpm build && pnpm lint && pnpm test`

## Key conventions

- **Linter/formatter**: Biome — not ESLint/Prettier. Run `pnpm lint` to check, `pnpm format` to fix.
- **Build**: tsup (ESM only, `.d.ts` emitted). `dist/` is gitignored, included in npm via `"files"`.
- **Test runner**: vitest. Single test file: `bunx vitest run packages/core/test/sanitize.test.ts`
- **Imports**: must be alphabetically ordered (Biome enforces). Use `.js` extensions in source imports.
- **Versions**: all three packages version-bumped together on every release.

## Publishing

```bash
# bump versions in packages/*/package.json
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "release X.Y.Z"
git push --follow-tags
NPM_TOKEN=<granular token with bypass-2fa> pnpm -r --filter './packages/*' publish --access public --no-git-checks
```

npm org: `@url-sanitize` — requires `antonio-orionus` account with granular access token (bypass-2FA enabled).

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
