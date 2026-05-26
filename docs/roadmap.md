# Roadmap

This document is the **canonical roadmap** for `url-sanitize`. It captures both the planned releases and the reasoning behind the decisions, so future contributors (and future-me) don't lose context.

## v0.1 — ClearURLs-compatible core (weekend MVP)

**Ships:**

- `@url-sanitize/core` — pure algorithm, factory pattern `compileSanitizer(catalog, options)`, discriminated-union result type, zero deps
- `@url-sanitize/clearurls` — ClearURLs catalog adapter + bundled snapshot + SHA256 verified during sync
- `@url-sanitize/cli` — minimal: positional URL args, `--json`, `--strip-referral`, `--help`
- Daily sync workflow → opens PR on rule changes with auto-generated changeset
- Vitest snapshot suite — fixtures live in `sources/clearurls/fixtures/`
- CI workflow — typecheck, lint, test, build
- License model docs + threat model + non-goals + ClearURLs compatibility migration guide

**Deferred from day 1 (intentionally):**

- `@url-sanitize/fetch` — runtime hot-refresh. Adds network surface; ship only after API stable.
- `@url-sanitize/action` — GitHub Action. Distribution channel, not core value. Ships after CLI proves out.
- Profiles (`safe`/`standard`/`aggressive`) — locks API too early. Start with explicit option flags, add profile shorthand once real-world combinations emerge.

## v0.2 — Hot refresh + CLI polish

**Ships:**

- `@url-sanitize/fetch` — fetch + SHA256-verify upstream catalog at runtime. Supports `pinnedHash` option for SaaS / paranoid deployments where consumer hardcodes a known-good hash and refuses any other.
- CLI flags: `--stdin` (read URL list from stdin), `--explain` (verbose result attribution), `--fail-on-change` (CI mode), `--in-place` (file rewrite)
- Cloudflare Worker example
- Express / Hono middleware example
- Bench harness — `benches/sanitize.bench.ts` measures regex compile time + per-URL sanitize cost

## v0.3 — CI integration

**Ships:**

- `@url-sanitize/action` — scans Markdown / docs / PR diffs for tracking-laden URLs
- Modes: `comment` (PR comment with cleaned URLs), `check` (fail CI), `fix` (commit patch)
- Sample workflow showing docs-hygiene gate

## v0.4 — Custom rules

**Ships:**

- User-defined catalogs via plain TypeScript `SanitizerCatalog` literal
- JSON Schema export for validating user-supplied catalogs
- Custom allowlist / blocklist composition helpers
- `mergeCatalogs(...)` utility

## v1.0 — Stable release

**Ships:**

- Stable public API on `@url-sanitize/core` (semver-stable result types, options object, exported types)
- Documented threat model + license boundaries
- Published benchmark numbers
- `SECURITY.md` with responsible-disclosure policy
- Fuzz-testing in CI — ReDoS guard, 10k random URLs/run, fails if any sanitize call exceeds 50ms

## v2.0 — Multi-source expansion

**Trigger conditions (don't ship speculatively):**

Trigger v2.0 work ONLY when at least one of:

- ≥3 unique users file issues asking for non-ClearURLs source coverage
- A paying sponsor appears
- A downstream consumer needs source-merging in production

**Ships if triggered:**

- `@url-sanitize/adguard` — AdGuard URL Tracking Protection filter parsed → `SanitizerCatalog`
- `@url-sanitize/brave` — Brave Debouncer + query-strip list
- `@url-sanitize/firefox` — Firefox query-stripping list (TOML-sourced)
- `@url-sanitize/merged` — union of all 4, dedup, conflict resolution, source priority config

**If never triggered**, v2.0 doesn't happen. ClearURLs-only is a complete product.

---

## Strategic context (the discussion this came from)

### Why "url-sanitize" not "clearurls-ts"

Three reasons, ranked by weight:

1. **Trademark hygiene.** ClearURLs is someone else's project name. Building a TS project under that brand without explicit blessing risks `cease-and-desist` letters or social-media drama. "ClearURLs-compatible" positioning in docs is safer.
2. **Architecture-first.** v2.0 plans for multi-source expansion. If named `clearurls-ts`, adding AdGuard/Brave packages requires either a rename (loses stars, breaks search) or scope mismatch. `url-sanitize` is forward-compatible from day 1.
3. **Investment signaling.** "url-sanitize" reads as infrastructure. "clearurls-ts" reads as wrapper. Infrastructure attracts contributors; wrappers don't.

### SEO mitigation for the rename

`clearurls-ts` wins exact-match search. `url-sanitize` doesn't. Mitigations baked into day-1 design:

- Package keywords include: `clearurls`, `clearurls-ts`, `clearurls-typescript`, `clearurls-compat`
- README H1 + above-fold opens with "Looking for ClearURLs in TypeScript?"
- Dedicated `docs/clearurls-compat.md` for migration searches
- HN / Reddit launch title front-loads `ClearURLs` keyword

### Why personal namespace, not org

`github.com/antonio-orionus/url-sanitize` + `@url-sanitize` npm scope. Reasons:

- Solo maintainer + <1k stars = org is bureaucracy without benefit
- Personal stars feed `antonio-orionus` profile heatmap (portfolio value)
- npm scope `@url-sanitize` decoupled from GH org — already owned by personal npm account
- Transfer to dedicated org is one-click when triggered by: second maintainer joining, sponsorship arriving, >2k stars, trademark dispute

### License model — MIT + LGPL split

- `@url-sanitize/core` — **MIT** (clean-room TS algorithm port against the public ClearURLs rule spec)
- `@url-sanitize/clearurls` — **MIT (code) + LGPL-3.0-only (bundled `data.json` derived from ClearURLs Rules repo)**
- `@url-sanitize/cli`, `@url-sanitize/fetch`, `@url-sanitize/action` — **MIT**

Why the split unlocks adoption:

- MIT engine = SaaS-friendly. Lets commercial / closed-source projects depend on the algorithm.
- LGPL on data = matches upstream ClearURLs Rules repo. No license-laundering.
- Competitor `@quik-fe/clear-urls` is **AGPL-3.0-only** (entire package). AGPL = network-use copyleft = SaaS adoption-blocker. Confirmed via npm + jsDelivr.
- Consumers who can't tolerate LGPL data can still use `@url-sanitize/core` with a custom catalog.

### Threat model — hash, not signature

ClearURLs ships SHA256 hex at `rules.minify.hash`. **No minisign / no GPG / no cosign.** Confirmed by 404 on `https://rules2.clearurls.xyz/data.minify.json.minisig`.

What this gives us:

- HTTPS + GitHub Pages TLS — transport integrity
- SHA256 file from same origin — consistency check (rules ↔ hash match)
- No provenance proof — compromised upstream origin = compromised everything

What we add:

- Sync workflow verifies hash before writing files; mismatch = abort + retry
- Cache-control issue: hash file has `max-age=600` (10min). Hash can be stale vs JSON. Sync script + workflow retry on mismatch instead of failing immediately.
- v0.2: `@url-sanitize/fetch` exposes `pinnedHash?: string` for consumer-side hash pinning (refuse any rules whose hash differs from the pinned value)

Stricter integrity (e.g. signing) would need upstream ClearURLs maintainers to opt in. Not our project's gap to fix.

### Why factory pattern over module singleton

Module-level `let cached: …` (anti-pattern from Arroxy's original `applyRules.ts`):

- Forbids multiple catalogs co-existing
- Breaks hot-reload — no clean cache invalidation
- Breaks SSR — mutable module-level state shared across requests

`compileSanitizer(catalog, opts) → fn` closure:

- Multiple catalogs co-exist (test fixtures + prod rules)
- Hot-reload: swap catalog, swap compiled function
- SSR-safe: no module-level state
- Tree-shakeable: dead-code-elim drops algorithm if consumer only fetches catalog

### Why discriminated union result, not bare string

Existing forks (`@quik-fe/clear-urls`, `@brandonkal/url-purify`, `@mkljczk/url-purify`) all return `string`. Loses information:

- Which provider matched? Useful for telemetry.
- Which params stripped? Useful for debugging.
- Was this a redirect unwrap or a param strip? Different security implications.

```ts
type SanitizeResult =
  | { kind: 'unchanged'; url: string }
  | { kind: 'cleaned'; original, url, strippedParams, matchedRules }
  | { kind: 'redirected'; original, url, via }
  | { kind: 'blocked'; original, via }
```

Consumers `switch (result.kind)` exhaustively. New variants = compile error.

### Why `domainBlocking` opt-in

ClearURLs has `completeProvider: true` (refuse to load URL entirely). Browser-extension semantics — wrong default for libraries. Most consumers want "clean if possible, pass through if not". Blocking is an opt-in.

### Catalog model — unified, source-tagged

`SanitizerRule` is a discriminated union over `kind` (`strip-param` / `raw-replace` / `unwrap-redirect` / `block-domain`). Every rule carries `source: RuleSource` (`clearurls` / `adguard` / `brave` / `firefox` / `custom`).

- Adapters live in source-specific packages and convert native formats → unified shape
- Core algorithm doesn't know which source produced a rule
- v2.0 multi-source merge becomes trivial: concat catalogs, optionally dedup
- Consumers can query "which source caught this?" via `matchedRules[].source`

### Fuzz testing — differentiator nobody else has

ClearURLs ruleset = ~200 provider regexes from random contributors. ReDoS risk is real (catastrophic backtracking in user-supplied URLs can hang a server).

Day-1 CI step in `packages/core/test/fuzz.test.ts` (v0.1 stretch, v1.0 mandatory):

- 10k random URLs → compiled sanitizer
- Assert no execution > 50ms
- Assert no thrown exceptions outside expected catches

Catches catastrophic-backtracking regexes upstream ships before they reach consumers. No existing fork does this.

### Non-goals (won't ship, ever)

See [docs/non-goals.md](non-goals.md). Stops scope-creep PRs cold.

---

## Compared-to existing options (for the README's positioning)

| Option | Stance |
| --- | --- |
| ClearURLs browser extension | End-user product, not a library. We're orthogonal. |
| ClearURLs Rules repo | We consume their feed. Upstream of us. |
| `@quik-fe/clear-urls` | AGPL-3.0-only. Adoption-blocker for SaaS. We solve license. |
| `@brandonkal/url-purify` | Static fork, no sync. We solve freshness. |
| `@mkljczk/url-purify` | Static fork, no sync. Same gap. |
| Hand-rolled regexes per project | Stale within months. We solve maintenance. |
| Brave Query String Filter | Browser-native, not a library. Different audience. |
| AdGuard URL Tracking filter | Filter-list format, not API. We could adapt (v2.0). |
| Unalix Python / Nim | Archived. Confirms TS gap. |

## Launch plan (when v0.1 ships)

1. README ready — clear value prop, install + quick start, comparison table
2. v0.1.0 publish to npm — `@url-sanitize/core`, `@url-sanitize/clearurls`, `@url-sanitize/cli`
3. Arroxy migrates from vendored `src/shared/clearurls/` to npm dep — dogfood + first production user
4. Announce on:
   - r/typescript
   - HN Show
   - lobste.rs
   - fediverse (Mastodon dev community)
   - ClearURLs maintainers (ask for blessing + link from their docs)
5. Issue templates ready (`broken-url.yml`, `false-positive.yml`, `rule-source-request.yml`) to absorb feedback
