# Roadmap

This document is the **canonical roadmap** for `url-sanitize`. It captures both the planned releases and the reasoning behind the decisions, so future contributors (and future-me) don't lose context. For day-to-day repo commands and agent-specific conventions, see [`AGENTS.md`](../AGENTS.md).

## Current status

For current install commands, package surfaces, release channels, and automation
status, use the [README](../README.md). This document keeps the milestone plan
and rationale so there is one public discovery surface and one planning record.

v0.1 through v2.4 are complete. v0.2 proved the package-manager path across
Homebrew and Scoop with CI/container install examples and install-and-exercise
smoke; v0.3 added runtime ClearURLs fetching, schema-backed custom catalogs,
and deterministic catalog composition; v1.0 stabilized the public API,
benchmarks, security policy, and release contract; v2.0 added the AdGuard,
Brave, and Firefox sources and the merged catalog; v2.1 hardened every surface
against hostile URLs and rule data; v2.2 moved the GPL-3.0 AdGuard source out
of the default catalog and made every artifact declare the licenses of the data
it ships; v2.3 added Brave's query filter and clean-URLs lists to the default;
v2.4 cleans every URL inside text and adds a browser playground.

There is no active milestone. New work is demand-driven and starts from the
deferred list below.

## Strategic bet

`url-sanitize` is a rarely-needed, do-one-thing utility. It should win on the `jq` / `ripgrep` / `yt-dlp` model: tiny single binary, installable everywhere, callable ad-hoc by humans and AI agents.

The adoption rule is blunt: meet people in their package manager, but run the same native core wherever possible.

1. **Everywhere install** — crates.io, PyPI, GitHub Release binaries, Homebrew, Scoop, and CI/container environments should land on one native binary; npm stays pure TypeScript until native npm packages are worth the extra registry overhead. Winget was submitted on 2026-11-07 (microsoft/winget-pkgs#473950); AUR and distro packages stay demand-driven.
2. **Agent-native output** — structured JSON, deterministic output, and explainable matches make this usable by agents without scraping terminal text.
3. **Correctness + explainability** — never break a URL silently; report which param, redirect provider, or block rule fired.
4. **Fresh rules with permissive engine licensing** — daily-synced ClearURLs-compatible data, MIT engine, no AGPL lock-in.
5. **Multi-source** — ClearURLs, Brave, and Firefox ship as one merged catalog; AdGuard (GPL-3.0 data) is an opt-in package (v2.0, v2.2). New sources must fit the MIT default: permissive or weak-copyleft data only.

The moat is execution and reach, not secrecy. The engine is small glue around public rule lists; the project wins by being the most correct, most current, most installable, and most automation-friendly option.

## Target architecture

One behavioral spec, many shells:

```text
url-sanitize/
├── catalog/                     # language-agnostic catalog artifacts
│   ├── catalog.json             # merged catalog, with provenance
│   └── clearurls.json  adguard.json  brave.json  firefox.json   # per-source catalogs
├── conformance/                 # behavior contract every implementation must pass
│   ├── vectors.jsonl  text-vectors.jsonl
│   ├── clearurls-corpus.jsonl
│   └── properties.md
├── crates/                      # Rust workspace
│   ├── url-sanitize-core/       # canonical native engine
│   └── url-sanitize/            # native CLI
├── packages/                    # TypeScript/JavaScript packages
│   ├── core/  clearurls/  cli/  fetch/
│   └── adguard/  brave/  firefox/  merged/
├── python/                      # PyPI wrapper around native CLI
├── site/                        # browser playground (GitHub Pages)
└── sources/                     # upstream sync scripts
```

JSON Schemas for catalogs, options, and results are exported from
`@url-sanitize/core` (`sanitizerCatalogJsonSchema` and friends), not kept as
files.

Engine decisions:

- The Rust `url-sanitize-core` crate is the canonical native core for the Rust CLI, PyPI package, Homebrew/Scoop packages, GitHub Release binaries, and CI/container wrappers. Winget and any future package should use the same native core.
- The pure TypeScript engine remains first-class. JS users should not be forced into WASM or native binaries for ordinary library use.
- The conformance corpus is the law. TypeScript, Rust, the Python wrapper, and native launchers must agree on behavior or CI fails.
- Language packages are adoption channels, not excuses to fork behavior. Prefer packaging or invoking the native binary over maintaining another sanitizer implementation.

## Guardrails

- **Correctness over coverage.** A cleaner that strips a real query param or mangles a path is worse than no cleaner.
- **Deterministic by default.** Pinned rules are the default for non-interactive use; live updates are opt-in. `--version` and structured output must surface catalog identity.
- **Licensing is legal, not marketing.** Verify each upstream list before bundling; keep NOTICE and [`docs/license-model.md`](license-model.md) rigorous.
- **No registry squatting.** Reserve names only when the milestone actually publishes them.
- **Demand sets priority.** Defer new wrappers and package-manager surfaces until they beat the current CLI/library path on real usefulness.

## v0.1 to v1.0 — Foundations

The README lists what each surface does today; these are the milestones in
short, with the reasons that still apply.

- **v0.1, ClearURLs-compatible core and Rust CLI.** `@url-sanitize/core`,
  `@url-sanitize/clearurls`, `@url-sanitize/cli`, the `url-sanitize-core` crate
  and the native CLI, held together by one conformance corpus, plus the daily
  rule sync. `@url-sanitize/fetch` waited for v0.3: it adds network surface, so
  it shipped only once the API was stable.
- **v0.2, distribution reach.** Release binaries for Linux x64/ARM64, macOS
  Apple Silicon/Intel and Windows x64, shell and PowerShell installers,
  Homebrew and Scoop, and smoke tests that install and run every one of them
  (npm, PyPI, crates.io, release assets, Homebrew, Scoop). Why before more
  features: a small utility is adopted where users already are, so the binary
  needed doors into every common environment before more rule sources.
- **v0.3, runtime catalogs and custom rules.** `@url-sanitize/fetch` fetches
  and SHA256-verifies the ClearURLs catalog at runtime, with `pinnedHash` for
  deployments that accept only a known-good hash. Custom catalogs through
  `defineCatalog()`, exported JSON Schemas, and `mergeCatalogs(...)`, which
  keeps input order and dedupes nothing behind the caller's back.
- **v1.0, stable release.** A semver-stable API on `@url-sanitize/core`, the
  threat model and license boundaries, benchmarks, `SECURITY.md`, the fuzz test
  (see the fuzz section below), artifact attestations on native releases, and
  every wrapper proving it runs the same binary version and catalog hash.

## v2.0 — Multi-source expansion

**Shipped.**

- `@url-sanitize/adguard` — AdGuard URL Tracking Protection filter parsed → `SanitizerCatalog`
- `@url-sanitize/brave` — Brave Debouncer (redirect unwrapping); Brave's query filter and clean-URLs lists followed in v2.3
- `@url-sanitize/firefox` — Firefox query-stripping list (TOML-sourced)
- `@url-sanitize/merged` — union of all 4 in a fixed source order (ClearURLs, AdGuard, Brave, Firefox; since v2.2 AdGuard is opt-in, see below). `mergeSources()` drops semantically identical rules by default, keeping the first, so the order of the catalogs passed in is the source priority. Conflicting rules from different sources all stay; conflict resolution is deferred.

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

## v2.2 — License-true defaults

**Shipped** as 2.2.0.

- The AdGuard URL Tracking filter's header names AdGuard Filters' GPL-3.0, not
  the LGPL-3.0 of the FiltersRegistry repo it is fetched from. Through v2.1 it
  was labelled LGPL and shipped in the default catalog, the npm CLI and the
  native binary.
- `@url-sanitize/merged`'s default is now ClearURLs, Brave and Firefox (about
  1,000 rules instead of 3,700). `@url-sanitize/adguard` still ships, labelled
  `MIT AND GPL-3.0-only`; pass `adguardCatalog` to `mergeSources()` to opt in.
- Every artifact declares the data it ships as an SPDX expression and carries
  the full license texts: source packages, the `url-sanitize` crate and binary
  (`MIT AND LGPL-3.0-only AND MPL-2.0`), release archives, Homebrew and Scoop.
  The PyPI sdist no longer packs the repository's rule data.
- Conformance vectors can name a catalog; the AdGuard vectors, including the
  only cross-engine `keep-param` coverage, run against all four sources.

**Why:** licensing is legal, not marketing (see Guardrails). GPL-3.0 data in
the default binary would put the default install under copyleft terms, which
the MIT engine exists to avoid. See [`docs/license-model.md`](license-model.md).

## v2.3 — Brave query filter and clean URLs

**Shipped** as 2.3.0.

- `@url-sanitize/brave` adds Brave's `query-filter.json` (the tracking params
  Brave strips on navigation) and `clean-urls.json` (per-site params behind its
  "Copy clean link"), from the same MPL-2.0 `brave/adblock-lists` repo as the
  Debouncer. The default catalog grows from 1,027 to 1,455 rules; 307 of the
  500 listed params were kept by the default before.
- Params the project treats as referral marketing (Amazon's affiliate `tag`,
  `ref`, `referrer`, …) become flagged rules, kept unless
  `stripReferralMarketing` is on. A test in `@url-sanitize/merged` fails when
  Brave lists a param that ClearURLs marks as referral marketing and the
  adapter doesn't flag it.

**Why:** the GPL-3.0 AdGuard source left the default in v2.2; these lists fit
the default's licensing and win back much of that coverage.

## v2.4 — URLs inside text, and a playground

**Shipped** as 2.4.0.

- Both CLIs take `--text`: each argument and stdin are copied to stdout with
  every `http(s)` URL in them cleaned, so `pbpaste | url-sanitize --text |
  pbcopy` cleans a whole message. With `--json`, one result per URL found.
- `sanitizeText(text, sanitize)` in `@url-sanitize/core` and
  `Sanitizer::sanitize_text` in `url-sanitize-core` do the same for library
  users.
- URL detection is normative (spec §6.5) and pinned for both engines by
  `conformance/text-vectors.jsonl`. Smart quotes, ellipsis and CJK punctuation
  end a URL: kept inside it, a trailing `”` would land in a stripped param's
  value and vanish from the text.
- A playground at <https://antonio-orionus.github.io/url-sanitize/> runs the
  default catalog in the browser: the clean text, and for every link the
  params stripped and the rule that matched. `pages.yml` redeploys it from
  `main`, the daily rule sync included.

**Why:** most tracking links reach people inside messages, notes and Markdown,
not one per line. Text mode is also what the deferred GitHub Action and MCP
server would build on.

## Deferred surfaces

These are intentionally below the shipped milestones. Revisit only when user
demand or maintenance leverage is concrete.

- `@url-sanitize/merged` conflict resolution and configurable source priority beyond catalog order.
- Not adopted: DuckDuckGo's `tracking-parameters` list (`duckduckgo/privacy-configuration`, Apache-2.0). Checked 2026-11-07: the default catalog already strips all 25 of its exact param names, and its 12 exception domains would cover only its own rules, so adding it changes no result. Its breakage exceptions would matter only if one source's exceptions could override other sources' rules (see conflict resolution above).
- AdGuard relicensing: asked on 2026-11-07 whether the URL Tracking filter may be used under LGPL-3.0 or a permissive license (AdguardTeam/AdguardFilters#246532), no answer yet. If yes, it can return to the default.
- Other lists with `$removeparam`-style rules are copyleft and can only be opt-in like AdGuard: uBlock Origin filters (GPL-3.0), EasyList/EasyPrivacy (GPL-3.0 or CC BY-SA 3.0). DandelionSprout's Legitimate URL Shortener uses a custom license and copies AdGuard's GPL rules.
- About 390 AdGuard strip rules (`example.*` hosts, `||host/dir/` paths) have never matched. The adapter can now build correct patterns for them, but reviving them unreviewed changes opt-in users' results: `||amazon.*^$removeparam=tag` would strip Amazon affiliate tags that are kept unless `stripReferralMarketing` is on.
- `@url-sanitize/action` — scans Markdown / docs / PR diffs for tracking-laden URLs, with possible `comment`, `check`, and `fix` modes. This is for downstream repos; this repo already has internal ClearURLs catalog sync automation.
- Profiles (`safe`/`standard`/`aggressive`): they would lock the API before real option combinations are known, so options stay explicit flags.
- Considered, with no plan and no one asking: an MCP server (`--json` already gives agents structured output), `url-sanitize-wasm` and in-process Python bindings (the TypeScript engine and the native CLI already cover those runtimes), AUR and distro packages. Native npm optional packages are left out on purpose; [`AGENTS.md`](../AGENTS.md) says why.

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

### License model — MIT code, upstream data licenses

The engine is MIT; each package that bundles rule data adds that data's license
(LGPL-3.0 for ClearURLs, MPL-2.0 for Brave and Firefox, GPL-3.0 for the opt-in
AdGuard package). [`docs/license-model.md`](license-model.md) is the
authoritative table.

Why the split unlocks adoption:

- MIT engine = SaaS-friendly. Lets commercial / closed-source projects depend on the algorithm.
- LGPL on data = matches upstream ClearURLs Rules repo. No license-laundering.
- Competitor `@quik-fe/clear-urls` is **AGPL-3.0-only** (entire package). AGPL = network-use copyleft = SaaS adoption-blocker. Confirmed via npm + jsDelivr.
- Consumers who can't tolerate LGPL data can still use `@url-sanitize/core` with a custom catalog.

### Threat model — hash, not signature

ClearURLs publishes a SHA256 next to its rules but no signature, so the sync
can prove the rules match the hash, not who wrote them; a compromised upstream
origin serves a matching pair. `@url-sanitize/fetch` adds consumer-side
`pinnedHash`. The v2.0 sources publish no hash at all, so their integrity rests
on TLS and on review of the daily sync PR. Stricter integrity (signing) would
need the upstream maintainers to opt in. [`docs/threat-model.md`](threat-model.md)
has the details.

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

The four upstream lists hold about 3,700 regexes; the default catalog uses about 1,450 of them. ReDoS risk is real (catastrophic backtracking in user-supplied URLs can hang a server).

Two CI tests, both seeded and deterministic. Their budgets are per call and in CPU time, not wall-clock time: a loaded machine deschedules the test process, which failed wall-clock budgets in the pre-push hook, while a slow pattern burns CPU either way.

- `packages/core/test/fuzz.test.ts`: 10k random URLs against ClearURLs alone; no throw, no call at 50 ms or more.
- `packages/merged/test/fuzz.test.ts`: all four sources, the default catalog plus opt-in AdGuard. 2k random URLs on catalog hosts and param names (50 ms budget); every distinct pattern, run alone on 8 KB URLs that repeat its own literals (`.*z=.*&var=` gets `z=z=z=…`; 250 ms budget); and 8 KB URLs that are all params (200 ms budget). About 2.5 s in all.

Random URLs never hit the inputs that make a pattern slow: AdGuard's `.*z=.*&var=` shipped cubic until v2.1, unnoticed by the v1.0 random test. v2.1 added the 8192-character URL cap, defused leading `.*` in match-only patterns, and a regression test in `packages/core/test/hardening.test.ts`. The literal-built inputs fail on that pattern undefended (about 38 s for one call) and pass with the defense.

What the merged test found on 2026-11-06 (Apple Silicon, Node 24): no pattern worse than quadratic. The slowest are ClearURLs redirect patterns that keep a leading `.*` for their capture group (instagram `.*u=([^&]*)`, rutracker `.*url=([^&]*)`, site2 `.*?\?.*=(.*)`), 25–40 ms on an 8 KB URL. The larger cost is linear: every strip-param rule tests every param, so an 8 KB URL of 2,000–4,000 params took about 160 ms in the TS engine and about 140 ms in the Rust release binary. Both engines now split and decode the query and fragment once per URL state rather than once per rule: about 15 ms in TS and 70 ms in Rust, where `regex-lite` matching the ~3,300 param patterns is most of what remains. The Rust engine also compiles each distinct url pattern and exception once, tests each at most once per URL state, and skips the regex when the URL lacks a literal every match must contain; that took a typical five-param URL from about 6 ms to 0.13 ms with every source, and from 2.3 ms to 0.05 ms with the v2.2 default catalog. The Rust engine uses `regex-lite`, whose matching is O(pattern × input) by construction, so it has no ReDoS test of its own.

### Non-goals (won't ship, ever)

See [docs/non-goals.md](non-goals.md). Stops scope-creep PRs cold.

---

## Compared to existing options

The README's [comparison table](../README.md#compared-to-existing-options)
covers the main alternatives. Two more, for the record:
`@brandonkal/url-purify` and `@mkljczk/url-purify` are static forks with no rule
sync, and Unalix (Python/Nim) is archived. Brave, AdGuard and Firefox are rule
sources here, not competitors (see v2.0).

## Announcements

None of the launch channels has been used as of 2026-11-07: no Show HN, r/typescript,
lobste.rs or fediverse post, and nothing filed with the ClearURLs maintainers (to ask
for their blessing and a link from their docs). Since new work waits for demand, a
missing announcement also means missing demand signal. Listing pull requests opened on
2026-11-07: winget (microsoft/winget-pkgs#473950) and awesome-cli-apps-in-a-csv
(toolleeo/awesome-cli-apps-in-a-csv#613) await review. awesome-privacy declined it the
same day (Lissy93/awesome-privacy#890): that list is for end users, and it already has
ClearURLs.
