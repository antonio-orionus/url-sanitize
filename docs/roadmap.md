# Roadmap

This document is the **canonical roadmap** for `url-sanitize`. It captures both the planned releases and the reasoning behind the decisions, so future contributors (and future-me) don't lose context. For day-to-day repo commands and agent-specific conventions, see [`AGENTS.md`](../AGENTS.md).

## Current status

For current install commands, package surfaces, release channels, and automation
status, use the [README](../README.md). This document keeps the milestone plan
and rationale so there is one public discovery surface and one planning record.

v0.1 through v2.1 are complete. v0.2 proved the package-manager path across
Homebrew and Scoop with CI/container install examples and install-and-exercise
smoke; v0.3 added runtime ClearURLs fetching, schema-backed custom catalogs,
and deterministic catalog composition; v1.0 stabilized the public API,
benchmarks, security policy, and release contract; v2.0 added the AdGuard,
Brave, and Firefox sources and the merged catalog; v2.1 hardened every surface
against hostile URLs and rule data.

There is no active milestone. New work is demand-driven and starts from the
deferred list at the bottom of this document.

## Strategic bet

`url-sanitize` is a rarely-needed, do-one-thing utility. It should win on the `jq` / `ripgrep` / `yt-dlp` model: tiny single binary, installable everywhere, callable ad-hoc by humans and AI agents.

The adoption rule is blunt: meet people in their package manager, but run the same native core wherever possible.

1. **Everywhere install** — crates.io, PyPI, GitHub Release binaries, Homebrew, Scoop, and CI/container environments should land on one native binary; npm stays pure TypeScript until native npm packages are worth the extra registry overhead. AUR, Winget, and distro packages stay demand-driven.
2. **Agent-native output** — structured JSON, deterministic output, and explainable matches make this usable by agents without scraping terminal text.
3. **Correctness + explainability** — never break a URL silently; report which param, redirect provider, or block rule fired.
4. **Fresh rules with permissive engine licensing** — daily-synced ClearURLs-compatible data, MIT engine, no AGPL lock-in.
5. **Multi-source** — ClearURLs, AdGuard, Brave, and Firefox ship as one merged catalog (v2.0). More sources are demand-driven.

The moat is execution and reach, not secrecy. The engine is small glue around public rule lists; the project wins by being the most correct, most current, most installable, and most automation-friendly option.

## Target architecture

One behavioral spec, many shells:

```text
url-sanitize/
├── catalog/                     # language-agnostic catalog artifacts
│   ├── catalog.json             # merged catalog, with provenance
│   └── clearurls.json  adguard.json  brave.json  firefox.json   # per-source catalogs
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
│   ├── adguard/  brave/  firefox/  merged/
├── python/                      # PyPI wrapper around native CLI
└── sources/                     # upstream sync scripts
```

JSON Schemas for catalogs, options, and results are exported from
`@url-sanitize/core` (`sanitizerCatalogJsonSchema` and friends), not kept as
files.

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
- **Demand sets priority.** Defer new wrappers and package-manager surfaces until they beat the current CLI/library path on real usefulness.

## v0.1 — ClearURLs-compatible core + Rust CLI

**Ships:**

- `@url-sanitize/core` — pure algorithm, factory pattern `compileSanitizer(catalog, options)`, discriminated-union result type, zero deps
- `@url-sanitize/clearurls` — ClearURLs catalog adapter + bundled snapshot + SHA256 verified during sync
- `@url-sanitize/cli` — minimal: positional URL args, `--json`, `--strip-referral`, `--help`
- `url-sanitize-core` — Rust engine crate matching the TypeScript behavior contract
- `url-sanitize` — native Rust CLI with embedded ClearURLs-compatible catalog
- Shared conformance corpus for TypeScript and Rust
- Daily sync workflow → opens PR on rule changes. Today `sync-clearurls.yml` syncs all four sources, bumps the version with `scripts/bump-version.mjs` and opens a `release:` PR; Changesets is no longer part of the release path.
- Vitest suite plus the shared conformance corpus in `conformance/`
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

## v1.0 — Stable release

**Ships:**

- Stable public API on `@url-sanitize/core` (semver-stable result types, options object, exported types)
- Documented threat model + license boundaries
- Published benchmark numbers
- `SECURITY.md` with responsible-disclosure policy
- Fuzz-testing in CI — 10k random URLs/run against the ClearURLs catalog, fails if any sanitize call exceeds 50ms (random URLs missed a real ReDoS; see v2.1)
- GitHub artifact-attestation-backed native releases.
- Every package ecosystem wrapper proves it invokes the same version/hash of the Rust binary or passes the same conformance smoke subset.

## v2.0 — Multi-source expansion

**Shipped.**

- `@url-sanitize/adguard` — AdGuard URL Tracking Protection filter parsed → `SanitizerCatalog`
- `@url-sanitize/brave` — Brave Debouncer (redirect unwrapping); Brave's query-strip list is deferred
- `@url-sanitize/firefox` — Firefox query-stripping list (TOML-sourced)
- `@url-sanitize/merged` — union of all 4 in a fixed source order (ClearURLs, AdGuard, Brave, Firefox). `mergeSources()` drops semantically identical rules by default, keeping the first, so the order of the catalogs passed in is the source priority. Conflicting rules from different sources all stay; conflict resolution is deferred.

**Implementation shape:**

- Keep every source as plain catalog data plus a small adapter package.
- Preserve `@url-sanitize/core` as the shared engine; do not fork sanitizer behavior by source.
- Extend conformance with source-specific fixtures before shipping merged behavior.
- Keep source provenance and license metadata explicit in each package and in merged output.
- Make `@url-sanitize/merged` deterministic: stable source order and stable output order.

## v2.1 — Security hardening

**Shipped** as 2.1.1 (2.1.0 was merged but never released: GitHub retired the
`macos-14` runner its release needed).

- Engines (TypeScript and Rust, kept identical): redirect targets must be `http(s)` without userinfo and are sanitized again (up to 5 levels), so a redirect to a blocked domain is `blocked`; URLs over 8192 characters come back unchanged; the TS engine drops a leading `.*` from match-only patterns; `raw-replace` output must keep its origin; rules match the URL without userinfo; percent-decoding and base64 behave the same in both engines.
- `keep-param` rule kind, used for AdGuard's `@@…$removeparam` allowlists. Engines skip rule kinds they don't know, so a newer catalog loads in an older engine.
- Brave `*.host` patterns stay inside the host; unknown upstream pattern shapes skip their rule instead of failing the unattended sync.
- CLIs: `--` ends options, control and bidi characters are escaped in text output, no silent truncation. Python wrapper: exact-name `PATH` lookup (no current folder, no `.cmd` shims), refuses to run itself. `@url-sanitize/fetch`: an empty `pinnedHash` throws, https only, body size cap.
- Release CI: `auto-tag` runs only for pushes to this repo's `main`, `id-token` only in the publish and attest jobs (each publish job in its own environment), every action pinned to a commit SHA.

**Why:** a reported `javascript:` redirect bypass led to a full audit. The v1.0
random-URL fuzz test never hit AdGuard's `.*z=.*&var=`, which took about 30 s on
an 8 KB URL in the TS engine; the length cap plus a targeted test replace that
blind spot.

## Deferred surfaces

These are intentionally below the shipped milestones. Revisit only when user
demand or maintenance leverage is concrete.

- `@url-sanitize/merged` conflict resolution and configurable source priority beyond catalog order.
- Brave's query-strip list.
- About 390 AdGuard strip rules (`example.*` hosts, `||host/dir/` paths) have never matched. The adapter can now build correct patterns for them, but reviving them unreviewed changes defaults: `||amazon.*^$removeparam=tag` would strip Amazon affiliate tags that are kept unless `stripReferralMarketing` is on.
- `@url-sanitize/action` — scans Markdown / docs / PR diffs for tracking-laden URLs, with possible `comment`, `check`, and `fix` modes. This is for downstream repos; this repo already has internal ClearURLs catalog sync automation.
- `@url-sanitize/mcp` — exposes `sanitize_url` with pinned, explainable, structured output for agent workflows.
- AUR packaging.
- Winget packaging.
- Distro packages.
- Native npm optional packages.
- `url-sanitize-wasm`.
- In-process Python bindings.

---

## Strategic context (the discussion this came from)

### Why "url-sanitize" not "clearurls-ts"

Three reasons, ranked by weight:

1. **Trademark hygiene.** ClearURLs is someone else's project name. Building a TS project under that brand without explicit blessing risks `cease-and-desist` letters or social-media drama. "ClearURLs-compatible" positioning in docs is safer.
2. **Architecture-first.** v2.0 plans for multi-source expansion. If named `clearurls-ts`, adding AdGuard/Brave packages requires either a rename (loses stars, breaks search) or scope mismatch. `url-sanitize` is forward-compatible from day 1.
3. **Investment signaling.** "url-sanitize" reads as infrastructure. "clearurls-ts" reads as wrapper. Infrastructure attracts contributors; wrappers don't.

### SEO mitigation for the rename

`clearurls-ts` wins exact-match search. `url-sanitize` doesn't. Mitigations baked into day-1 design:

- Package keywords include `clearurls`; `@url-sanitize/clearurls` also carries `clearurls-ts` and `clearurls-typescript` (`clearurls-compat` was planned but is not in any `package.json`)
- README opens with "Looking for ClearURLs behavior as a library or CLI?"
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
- `@url-sanitize/adguard` — **LGPL-3.0-only** (bundled AdGuard filter data)
- `@url-sanitize/brave` and `@url-sanitize/firefox` — **MPL-2.0** (bundled Brave and Mozilla data)
- `@url-sanitize/merged` — **MIT (code) + the upstream data licenses** of the four catalogs it bundles
- `@url-sanitize/cli` and `@url-sanitize/fetch` — **MIT**

[`docs/license-model.md`](license-model.md) is the authoritative table. The
`license` field in `@url-sanitize/clearurls`'s `package.json` says
`LGPL-3.0-only` for the whole package; its `LICENSE` file carries the MIT/LGPL
split.

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
- v0.3: `@url-sanitize/fetch` exposes `pinnedHash?: string` for consumer-side hash pinning (refuse any rules whose hash differs from the pinned value). Since v2.1, a `pinnedHash` set to `undefined` or `''` throws instead of silently disabling the pin.

Stricter integrity (e.g. signing) would need upstream ClearURLs maintainers to opt in. Not our project's gap to fix.

The v2.0 sources publish no hash at all. The AdGuard, Brave, and Firefox sync
scripts fetch over TLS (raw.githubusercontent.com and Mozilla Remote Settings)
and compute their own SHA256 only to detect changes, so their integrity rests
on TLS and on review of the daily sync PR. `@url-sanitize/fetch` fetches only
the ClearURLs catalog.

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

`SanitizerRule` is a discriminated union over `kind` (`strip-param` / `raw-replace` / `unwrap-redirect` / `block-domain` / `keep-param`). Every rule carries `source: RuleSource` (`clearurls` / `adguard` / `brave` / `firefox` / `custom`).

- Adapters live in source-specific packages and convert native formats → unified shape
- Core algorithm doesn't know which source produced a rule
- v2.0 multi-source merge becomes trivial: concat catalogs, optionally dedup
- Consumers can query "which source caught this?" via `matchedRules[].source`

### Fuzz testing — differentiator nobody else has

The shipped catalog is about 3,700 regexes from four upstream lists. ReDoS risk is real (catastrophic backtracking in user-supplied URLs can hang a server).

Two CI tests, both seeded and deterministic:

- `packages/core/test/fuzz.test.ts`: 10k random URLs against ClearURLs alone; no throw, no call at 50 ms or more.
- `packages/merged/test/fuzz.test.ts`: the merged catalog, which ships as the default. 2k random URLs on catalog hosts and param names (50 ms budget); every distinct pattern, run alone on 8 KB URLs that repeat its own literals (`.*z=.*&var=` gets `z=z=z=…`; 250 ms budget); and 8 KB URLs that are all params (200 ms budget). About 2.5 s in all.

Random URLs never hit the inputs that make a pattern slow: AdGuard's `.*z=.*&var=` shipped cubic until v2.1, unnoticed by the v1.0 random test. v2.1 added the 8192-character URL cap, defused leading `.*` in match-only patterns, and a regression test in `packages/core/test/hardening.test.ts`. The literal-built inputs fail on that pattern undefended (about 38 s for one call) and pass with the defense.

What the merged test found on 2026-11-06 (Apple Silicon, Node 24): no pattern worse than quadratic. The slowest are ClearURLs redirect patterns that keep a leading `.*` for their capture group (instagram `.*u=([^&]*)`, rutracker `.*url=([^&]*)`, site2 `.*?\?.*=(.*)`), 25–40 ms on an 8 KB URL. The larger cost is linear: every strip-param rule tests every param, so an 8 KB URL of 2,000–4,000 params took about 160 ms in the TS engine and about 140 ms in the Rust release binary. Both engines now split and decode the query and fragment once per URL state rather than once per rule: about 15 ms in TS and 95 ms in Rust, where `regex-lite` matching the ~3,300 param patterns is most of what remains. The Rust engine uses `regex-lite`, whose matching is O(pattern × input) by construction, so it has no ReDoS test of its own.

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
| Brave Debouncer + query-string filter | Browser-native lists. The Debouncer is adapted as `@url-sanitize/brave` (v2.0); the query-strip list is deferred. |
| AdGuard URL Tracking filter | Filter-list format, not API. Adapted as `@url-sanitize/adguard` (v2.0). |
| Firefox query stripping | Browser-native list. Adapted as `@url-sanitize/firefox` (v2.0). |
| Unalix Python / Nim | Archived. Confirms TS gap. |

## v0.1 launch history

1. README ready — clear value prop, install + quick start, comparison table
2. v0.1.0 published to npm — `@url-sanitize/core`, `@url-sanitize/clearurls`, `@url-sanitize/cli`
3. v0.1.2 aligned npm, crates.io, PyPI, and GitHub Release assets on one version
4. v0.1.3 added verified Homebrew and Scoop publication on top of the automated release pipeline
5. v0.1.4 added Intel macOS native archives, centralized release matrix dry-runs, auto-tag dispatch hardening, and public release smoke inside the release workflow
6. Arroxy dropped its vendored `src/shared/clearurls/` for `@url-sanitize/core` and `@url-sanitize/clearurls` on 2026-05-26; it still pins 2.0.2, which predates the v2.1 hardening
7. Announcement channels, none used as of 2026-11-06 (no Show HN post, nothing filed with the ClearURLs maintainers):
   - r/typescript
   - HN Show
   - lobste.rs
   - fediverse (Mastodon dev community)
   - ClearURLs maintainers (ask for blessing + link from their docs)
8. Issue templates `broken-url.yml` and `rule-source-request.yml` absorb feedback; the planned `false-positive.yml` was never added
