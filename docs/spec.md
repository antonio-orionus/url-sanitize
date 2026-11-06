# url-sanitize — Behavioral Specification

This document is the **contract** every implementation must satisfy. It applies
to both the TypeScript engine (`@url-sanitize/core`) and the Rust engine
(`url-sanitize-core`), as well as any future shell such as WASM or PyO3.

All implementations are validated against the [conformance corpus](../conformance/).
Any divergence is a release-blocking bug.

---

## 1. Result schema

A sanitization call returns exactly one of four variants (discriminated union):

```jsonc
// unchanged — input was not touched (no rule applied OR input was malformed)
{ "kind": "unchanged", "url": "<input verbatim>" }

// cleaned — one or more strip-param / raw-replace rules applied
{
  "kind": "cleaned",
  "original": "<input>",
  "url": "<sanitized>",
  "strippedParams": ["utm_source", "fbclid", ...],
  "matchedRules": [{ "source": "clearurls", "provider": "globalRules", "kind": "strip-param", "detail": "utm_source,utm_medium" }, ...]
}

// redirected — an unwrap-redirect rule produced a target URL
{
  "kind": "redirected",
  "original": "<input>",
  "url": "<unwrapped target>",
  "via": { "source": "clearurls", "provider": "google-redirect", "kind": "unwrap-redirect" }
}

// blocked — a block-domain rule fired (requires domainBlocking option)
{
  "kind": "blocked",
  "original": "<input>",
  "via": { "source": "clearurls", "provider": "<provider>", "kind": "block-domain" }
}
```

`MatchedRule.detail` is optional; for `strip-param` it is a comma-joined list of
the parameter names that matched (for diagnostics — not stable order across
implementations, do not parse).

JSON Schema exports for catalogs and results are provided by
`@url-sanitize/core`. The schema in
[`conformance/schema.json`](../conformance/schema.json) covers conformance
vector files only.

---

## 2. Sanitizer options

```ts
interface SanitizerOptions {
  stripReferralMarketing?: boolean; // default: false
  unwrapRedirects?: boolean;        // default: true
  domainBlocking?: boolean;         // default: false
}
```

Defaults are chosen so the default sanitizer is **safe** (never turns a working
URL into a broken one) and **agent-friendly** (predictable, never blocks
without opt-in).

### 2.1 Catalog shape

```ts
interface SanitizerCatalog {
  version: string;
  generatedAt: string;
  sources: Array<{
    name: 'clearurls' | 'adguard' | 'brave' | 'firefox' | 'custom';
    version?: string;
    hash?: string;
    license?: string;
    upstream?: string;
  }>;
  rules: SanitizerRule[];
}
```

Catalogs are plain data. `@url-sanitize/core` exports JSON Schema constants for
catalogs, options, and results, plus `defineCatalog()` for typed custom catalog
literals and `mergeCatalogs()` for deterministic order-preserving composition.

---

## 3. Algorithm (normative)

Given an input string `S`:

1. **Parse.** Attempt to construct a WHATWG URL from `S`.
   - If parsing fails, return `{ kind: "unchanged", url: S }` immediately.
   - If parsing succeeds, set `current = url.toString()` (the normalized form
     used as the working state).
   - If `current` is longer than 8192 characters, return
     `{ kind: "unchanged", url: S }` immediately. Every rule's regex runs over
     the whole URL, so this bounds the work per call. (`current` is ASCII
     after WHATWG serialization, so both engines count the same.)

2. **Iterate rules in catalog order.** Rules match against the **match view**:
   `current` with any username and password removed, so `https://x@host/`
   can't hide `host` from `^https?://host` patterns. Edits still apply to
   `current`, which keeps its userinfo. For each compiled rule:

   a. **Applicability filter:**
      - For all kinds: if `rule.urlPattern` is set and does not match the
        match view, skip.
      - For all kinds: if any `rule.exceptions` regex matches the match view,
        skip.

   b. **Dispatch by kind:**

      - **`block-domain`**: if `domainBlocking` is false, skip. Otherwise return
        `{ kind: "blocked", original: S, via }` immediately. (Terminal.)

      - **`unwrap-redirect`**: if `unwrapRedirects` is false, skip.
        Run `rule.pattern` against the match view by default, or against the
        URL pathname when `matchPart: "pathname"` is set. Take capture group
        `rule.captureGroup`, or substitute `$1..$9` into `targetTemplate` when
        set (an empty template gives an empty target). Percent-decode it, or
        percent-decode then base64-decode when `targetEncoding: "base64"` is
        set. If `prependScheme` is set, prepend that scheme only when the
        target is not already a valid absolute URL. Try to parse as URL.
        - If valid URL with scheme `http` or `https` and no username or password: sanitize the target again with the same options (at most 5 nested levels; deeper targets are returned as parsed). If that gives `blocked`, return `{ kind: "blocked", original: S, via }` with the blocking rule's `via`. Otherwise return `{ kind: "redirected", original: S, url: <the result's url>, via }`. (Terminal.)
        - If invalid, empty, any other scheme (`javascript:`, `data:`, `file:`, …), or carrying userinfo (`https://good.com@evil.com/`): skip and continue iteration.

        **Percent-decoding** is byte-wise: `%XX` with two hex digits becomes
        that byte, any other `%` stays literal, and the bytes are read as
        UTF-8 with invalid sequences replaced by U+FFFD. **Base64** accepts
        the standard or URL-safe alphabet with optional padding, and only in
        canonical form: no whitespace, no non-zero trailing bits.

      - **`raw-replace`**: replace all (`g` flag) matches of `rule.pattern` in
        `current` with `rule.replacement`, taken as literal text (no `$&` or
        `$1` expansion). Keep the result only if it parses as a URL with the
        same scheme, username, password, host and port as `current`:
        cleaning may change path, query and fragment, never the origin. If
        kept and changed, update `current` and record a `matchedRules` entry.

      - **`strip-param`**: if `rule.isReferralMarketing` and not
        `stripReferralMarketing`, skip. Re-parse `current` as URL. Walk both
        the query string (`?...`) and the fragment-as-query (`#...`), splitting
        on `&`. For each `name[=value]` pair: if `paramPattern` matches the
        percent-decoded name (anchored, case-insensitive: `^(?:<pattern>)$`)
        and `valuePattern` is absent or matches the raw value, drop the pair
        and append the raw name to `strippedParams`. Reassemble only the part
        that lost a pair, so a bare `?` or `#` elsewhere survives. If
        anything was removed, update `current` and record a `matchedRules`
        entry. Order of kept pairs is preserved.

3. **Finalize.**
   - If `current == original input verbatim`, return `{ kind: "unchanged", url: S }`.
   - Otherwise return `{ kind: "cleaned", original: S, url: current, strippedParams, matchedRules }`.

Note: step 3's equality check uses the **original input string** `S`, not the
post-parse normalized form. An input that WHATWG normalization alters
(`HTTPS://A.COM` → `https://a.com/`) therefore returns `cleaned` with the
normalized URL and an empty `matchedRules`, even when no rule fired.

---

## 4. Regex semantics

All catalog regex patterns use ECMAScript regex syntax. Implementations must
support at minimum:

- character classes (`[a-z]`, `[^...]`, `\d`, `\w`, `\s`)
- quantifiers (`*`, `+`, `?`, `{n,m}`)
- alternation, grouping (`(?:...)`, capturing `(...)`)
- anchors (`^`, `$`)
- backreferences are NOT required (ClearURLs corpus does not use them)
- lookaround is NOT required

Flags used (per kind):

| Kind              | Flags       |
| ----------------- | ----------- |
| `strip-param`     | `i` (param name match is case-insensitive, anchored as `^(?:P)$`) |
| `valuePattern`    | `i` (param value match is case-insensitive, anchored as `^(?:P)$`) |
| `raw-replace`     | `gi`        |
| `unwrap-redirect` | `i`         |
| `urlPattern`      | `i`         |
| `exceptions`      | (none)      |

Implementations should use a **linear-time / ReDoS-safe** regex engine
(`regex-lite` in Rust). A pattern that fails to compile MUST be silently
dropped from the compiled ruleset (do not crash startup). If any of a rule's
exceptions fails to compile, the whole rule is dropped: keeping the rule
without that exception would widen it.

The TS engine's `RegExp` backtracks. For patterns only tested for a match
(`urlPattern`, `exceptions`) it drops a leading `.*` or `.*?`, which can't
change whether an unanchored pattern matches but makes `.*a.*b` cubic. The
length cap in step 1 bounds what remains.

---

## 5. URL parsing

Implementations MUST use a WHATWG URL parser:

- TS: `new URL(input)`
- Rust: the `url` crate

This ensures cross-engine parity on normalization (percent-encoding case,
default ports, trailing slash on bare hosts, etc.).

When stripping params, the URL is **re-parsed** from `current` (which may have
been mutated by an earlier `raw-replace`). If re-parse fails, the strip step
is skipped silently.

---

## 6. CLI contract

The CLI is **agent-callable**: deterministic, scriptable, no prompts, no
interactive output by default.

### 6.1 Synopsis

```
url-sanitize [OPTIONS] [URL]...
url-sanitize [OPTIONS] -          # read URLs from stdin (one per line)
url-sanitize [OPTIONS] < urls.txt # same
```

If no URLs are passed positionally and stdin is a TTY, print help and exit 1.
If no URLs are passed positionally and stdin is a pipe/file, read from stdin.

### 6.2 Flags

| Flag                  | Default | Effect |
| --------------------- | ------- | ------ |
| `--json`              | off     | Emit one JSON `SanitizeResult` per input line on stdout |
| `--explain`           | off     | Like default mode, but also write a `# matched: ...` comment line on stderr per cleaned URL |
| `--strip-referral`    | off     | Set `stripReferralMarketing: true` |
| `--keep-referral`     | on      | Explicit no-op; overrides `--strip-referral` if both passed |
| `--unwrap-redirects`  | on      | Set `unwrapRedirects: true` |
| `--no-unwrap-redirects` | off   | Set `unwrapRedirects: false` |
| `--block-domains`     | off     | Set `domainBlocking: true` |
| `--version`           |         | Print `url-sanitize <version> (catalog <hash> <generatedAt>)` and exit 0 |
| `-h`, `--help`        |         | Print usage and exit 0 |

The catalog is **pinned** at build time. There is no `--update`; runtime
catalog refresh lives in `@url-sanitize/fetch`.

### 6.3 Output

Default (non-`--json`) mode, one line per input URL on stdout:

| Result kind  | stdout                        | stderr                        |
| ------------ | ----------------------------- | ----------------------------- |
| `unchanged`  | `<url>\n`                     | —                             |
| `cleaned`    | `<sanitized url>\n`           | (with `--explain`) `# cleaned: <orig> -> <new> [provider]`\n |
| `redirected` | `<target url>\n`              | (with `--explain`) `# redirected: <orig> -> <target> [provider]`\n |
| `blocked`    | (nothing)                     | `blocked: <url> (via <provider>)\n` |

`--json` mode: one `SanitizeResult` JSON object per line on stdout, regardless
of kind (`blocked` is emitted as JSON, NOT as a stderr message). Stderr stays
empty in `--json` mode.

Newlines are LF (`\n`) on all platforms.

### 6.4 Exit codes

| Code | Meaning |
| ---- | ------- |
| 0    | All URLs processed; none blocked |
| 1    | Usage error (bad flag, no input + TTY stdin) |
| 2    | At least one URL was `blocked` (only possible with `--block-domains`) |
| 3    | Catalog load error (should not occur — catalog is embedded) |

Note: `unchanged`, `cleaned`, and `redirected` all exit 0. The CLI does NOT
treat "URL was modified" as a non-zero condition — agents pipe URLs through it.

### 6.5 Determinism guarantees

- Output for a given (input, catalog hash, options) tuple is byte-for-byte
  identical across runs and platforms.
- `--version` prints the catalog hash so reproducible-build consumers can pin.
- The TS and Rust engines produce identical `SanitizeResult` values for all
  inputs in the conformance corpus.

---

## 7. Library API

### 7.1 TypeScript

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { mergedCatalog, sanitize } from '@url-sanitize/merged';

// pre-compiled default
sanitize('https://example.com/?utm_source=x');

// custom options
const custom = compileSanitizer(mergedCatalog, { stripReferralMarketing: true });
custom('...');
```

### 7.2 Rust

```rust
use url_sanitize_core::{Catalog, SanitizerOptions};

let json = std::fs::read_to_string("catalog/catalog.json")?;
let catalog = Catalog::from_json(&json)?;
let sanitizer = catalog.compile(SanitizerOptions::default());
let result = sanitizer.sanitize("https://example.com/?utm_source=x");
```

The Rust `SanitizeResult` mirrors the TS discriminated union as an enum and
serializes to identical JSON via `serde`.

---

## 8. Versioning

All packages (`@url-sanitize/core`, `@url-sanitize/clearurls`,
`@url-sanitize/adguard`, `@url-sanitize/brave`, `@url-sanitize/firefox`,
`@url-sanitize/merged`, `@url-sanitize/cli`, `@url-sanitize/fetch`,
`url-sanitize-core` crate, `url-sanitize` crate, and the Python package in
`pyproject.toml`) version-bump together. The public API is
governed by **semver of the result schema and CLI contract**, not by any single
language binding. Breaking the schema is a major bump everywhere.
