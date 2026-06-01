# Roadmap

This document is the **canonical roadmap** for `url-sanitize`. It captures both the planned releases and the reasoning behind the decisions, so future contributors (and future-me) don't lose context. For day-to-day repo commands and agent-specific conventions, see [`AGENTS.md`](../AGENTS.md).

## Current status

For current install commands, package surfaces, release channels, and automation
status, use the [README](../README.md). This document keeps the milestone plan
and rationale so there is one public discovery surface and one planning record.

v0.1, v0.2, and v0.3 are complete. The main package-manager path is proven
across Homebrew and Scoop, v0.2 has CI/container install examples plus
install-and-exercise smoke, and v0.3 adds runtime ClearURLs fetching,
schema-backed custom catalogs, and deterministic catalog composition. GitHub
Action, MCP, AUR, Winget, and distro packages are deferred until user demand or
cheap automation makes them worth the maintenance surface.

## Strategic bet

`url-sanitize` is a rarely-needed, do-one-thing utility. It should win on the `jq` / `ripgrep` / `yt-dlp` model: tiny single binary, installable everywhere, callable ad-hoc by humans and AI agents.

The adoption rule is blunt: meet people in their package manager, but run the same native core wherever possible.

1. **Everywhere install** — crates.io, PyPI, GitHub Release binaries, Homebrew, Scoop, and CI/container environments should land on one native binary; npm stays pure TypeScript until native npm packages are worth the extra registry overhead. AUR, Winget, and distro packages stay demand-driven.
2. **Agent-native output** — structured JSON, deterministic output, and explainable matches make this usable by agents without scraping terminal text.
3. **Correctness + explainability** — never break a URL silently; report which param, redirect provider, or block rule fired.
4. **Fresh rules with permissive engine licensing** — daily-synced ClearURLs-compatible data, MIT engine, no AGPL lock-in.
5. **Multi-source later** — AdGuard/Brave/Firefox sources matter, but only after the install story is strong enough for users to notice.

The moat is execution and reach, not secrecy. The engine is small glue around public rule lists; the project wins by being the most correct, most current, most installable, and most automation-friendly option.

## Target architecture

One behavioral spec, many shells:

```text
url-sanitize/
├── catalog/                     # language-agnostic catalog artifacts
│   ├── clearurls.json           # synced source today
│   ├── catalog.json             # future merged catalog, with provenance
│   ├── adguard.json             # future synced source
│   └── schema.json              # JSON Schema for catalog interchange
├── conformance/                 # behavior contract every implementation must pass
│   ├── vectors.jsonl
│   ├── clearurls-corpus.jsonl
│   └── properties.md
├── crates/                      # Rust workspace
│   ├── url-sanitize-core/       # canonical native engine
│   ├── url-sanitize/            # native CLI
│   ├── url-sanitize-wasm/       # optional future WASM path
│   └── url-sanitize-py/         # optional future in-process Python bindings
├── packages/                    # TypeScript/JavaScript packages
│   ├── core/  clearurls/  cli/  fetch/
├── python/                      # PyPI wrapper around native CLI
└── sources/                     # upstream sync scripts
```

Engine decisions:

- The Rust `url-sanitize-core` crate is the canonical native core for the Rust CLI, PyPI package, Homebrew/Scoop packages, GitHub Release binaries, and CI/container wrappers. Future AUR/Winget/distro packages should use the same native core if demand justifies them.
- The pure TypeScript engine remains first-class. JS users should not be forced into WASM or native binaries for ordinary library use.
- The conformance corpus is the law. TypeScript, Rust, Python wrappers, WASM, and native launchers must agree on behavior or CI fails.
- Language packages are adoption channels, not excuses to fork behavior. Prefer packaging or invoking the native binary over maintaining another sanitizer implementation.

## Guardrails

- **Correctness over coverage.** A cleaner that strips a real query param or mangles a path is worse than no cleaner.
- **Deterministic by default.** Pinned rules are the default for non-interactive use; live updates are opt-in. `--version` and structured output must surface catalog identity.
- **Licensing is legal, not marketing.** Verify each upstream list before bundling; keep NOTICE and [`docs/license-model.md`](license-model.md) rigorous.
- **No registry squatting.** Reserve names only when the milestone actually publishes them.
- **Demand sets priority.** Ship what humans, CI, and agents actually invoke before speculative wrappers.

## v0.1 — ClearURLs-compatible core + Rust CLI

**Ships:**

- `@url-sanitize/core` — pure algorithm, factory pattern `compileSanitizer(catalog, options)`, discriminated-union result type, zero deps
- `@url-sanitize/clearurls` — ClearURLs catalog adapter + bundled snapshot + SHA256 verified during sync
- `@url-sanitize/cli` — minimal: positional URL args, `--json`, `--strip-referral`, `--help`
- `url-sanitize-core` — Rust engine crate matching the TypeScript behavior contract
- `url-sanitize` — native Rust CLI with embedded ClearURLs-compatible catalog
- Shared conformance corpus for TypeScript and Rust
- Daily sync workflow → opens PR on rule changes with auto-generated changeset
- Vitest snapshot suite — fixtures live in `sources/clearurls/fixtures/`
- CI workflow — typecheck, lint, test, build, generated-corpus freshness, Rust conformance, binary size check
- License model docs + threat model + non-goals + ClearURLs compatibility migration guide

**Deferred from day 1 (intentionally):**

- `@url-sanitize/fetch` — runtime hot-refresh. Adds network surface; ship only after API stable.
- `@url-sanitize/action` — downstream adoption channel, not internal sync or core value. Deferred until users ask for PR/docs hygiene automation.
- Profiles (`safe`/`standard`/`aggressive`) — locks API too early. Start with explicit option flags, add profile shorthand once real-world combinations emerge.

## v0.2 — Distribution reach

**Ships:**

- Broader GitHub Release binary coverage where CI can build and smoke-test the target. v0.1.4 ships Linux x64/ARM64, macOS Apple Silicon/Intel, and Windows x64 archives.
- Release automation refinements for archives, shell installer, PowerShell installer, and Homebrew/Scoop-ready assets. v0.1.4 proved GitHub Release assets, installer smokes, automated Homebrew/Scoop metadata publication, and public endpoint smoke.
- npm CLI remains pure TypeScript in v0.2 to avoid many platform package names and trusted-publisher setup. Native npm optional packages stay deferred until there is clear demand.
- Homebrew and Scoop packages shipped and are release-verified.

**Implemented:**

- Package-manager smoke coverage: CI validates Homebrew formula syntax, installs and exercises the checked-in Homebrew formula on macOS, installs and exercises the checked-in Scoop manifest on Windows, release dry-runs Homebrew/Scoop metadata generation, public release smoke verifies npm, crates.io, PyPI, GitHub Release assets, Homebrew formula metadata, and Scoop manifest metadata, then installs and exercises the published Homebrew/Scoop packages.
- README install sections cover direct installers, pinned direct binary download, npm/npx, cargo, PyPI wrapper requirements, Homebrew, Scoop, GitHub Actions, GitLab CI, Dockerfile, and package-manager CI snippets.
- Wrapper smoke parity: reusable smoke helpers exercise `--version`, catalog hash format, `--json`, stdin, and default output for native binaries, installers, Homebrew, Scoop, the npm CLI, and the Python wrapper.

**Deferred:**

- AUR packaging.
- Winget packaging.

**Why before more features:**

`url-sanitize` is a small utility. Adoption comes from being available exactly where a user already is. More rule sources help later; first, the binary needs doors into every common environment.

## v0.3 — Runtime catalogs + custom rules

**Ships:**

- `@url-sanitize/fetch` — fetch + SHA256-verify upstream catalog at runtime. Supports `pinnedHash` option for SaaS / paranoid deployments where consumer hardcodes a known-good hash and refuses any other.
- User-defined catalogs via plain TypeScript `SanitizerCatalog` literals and `defineCatalog()`.
- JSON Schema exports for validating user-supplied catalogs, options, and results.
- Custom catalog composition through plain data plus `mergeCatalogs(...)`
- `mergeCatalogs(...)` utility with deterministic input-order preservation and no hidden dedupe.

## Deferred adoption surfaces

**Revisit when demand is concrete:**

- `@url-sanitize/action` — scans Markdown / docs / PR diffs for tracking-laden URLs, with possible `comment`, `check`, and `fix` modes. This is for downstream repos; this repo already has internal ClearURLs catalog sync automation.
- `@url-sanitize/mcp` — exposes `sanitize_url` with pinned, explainable, structured output for agent workflows.
- AUR packaging.
- Winget packaging.

## v1.0 — Stable release

**Ships:**

- Stable public API on `@url-sanitize/core` (semver-stable result types, options object, exported types)
- Documented threat model + license boundaries
- Published benchmark numbers
- `SECURITY.md` with responsible-disclosure policy
- Fuzz-testing in CI — ReDoS guard, 10k random URLs/run, fails if any sanitize call exceeds 50ms
- GitHub artifact-attestation-backed native releases.
- Every package ecosystem wrapper proves it invokes the same version/hash of the Rust binary or passes the same conformance smoke subset.

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
- `@url-sanitize/cli` and `@url-sanitize/fetch` — **MIT**

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
- v0.3: `@url-sanitize/fetch` exposes `pinnedHash?: string` for consumer-side hash pinning (refuse any rules whose hash differs from the pinned value)

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

## v0.1 launch history

1. README ready — clear value prop, install + quick start, comparison table
2. v0.1.0 published to npm — `@url-sanitize/core`, `@url-sanitize/clearurls`, `@url-sanitize/cli`
3. v0.1.2 aligned npm, crates.io, PyPI, and GitHub Release assets on one version
4. v0.1.3 added verified Homebrew and Scoop publication on top of the automated release pipeline
5. v0.1.4 added Intel macOS native archives, centralized release matrix dry-runs, auto-tag dispatch hardening, and public release smoke inside the release workflow
6. Arroxy migration from vendored `src/shared/clearurls/` to npm dep remains the dogfood path
7. Future announcement channels:
   - r/typescript
   - HN Show
   - lobste.rs
   - fediverse (Mastodon dev community)
   - ClearURLs maintainers (ask for blessing + link from their docs)
8. Issue templates ready (`broken-url.yml`, `false-positive.yml`, `rule-source-request.yml`) to absorb feedback
