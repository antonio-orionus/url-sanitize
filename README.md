# url-sanitize

> URL sanitization engines for TypeScript and Rust, powered by ClearURLs-compatible rules, explainable results, and a shared conformance corpus.

**Looking for ClearURLs as a library or CLI?** You're in the right place. `url-sanitize` ships a MIT-licensed sanitization engine, ClearURLs-compatible rules with daily upstream sync, and explainable results that tell you exactly which rule changed your URL.

Use it from npm, crates.io, native binaries, CLIs, GitHub Actions, workers, browsers, edge runtimes, Node.js, Bun, and Deno.

## Why this exists

- **One behavior contract across languages.** TypeScript and Rust engines are checked against the same JSONL conformance corpus.
- **Explainable privacy cleanup.** Results include the stripped params, redirect provider, or block rule instead of returning an opaque string.
- **ClearURLs-compatible without AGPL engine lock-in.** Engine, CLIs, and tooling are MIT; ClearURLs-derived rule data remains LGPL-3.0-only.
- **Automation-friendly.** The Rust CLI is deterministic, prompt-free, supports `--json`, and embeds a pinned catalog.
- **Fresh rules.** GitHub Actions syncs the upstream ClearURLs catalog daily and release workflows publish npm packages plus crates.

## Install

**TypeScript / JavaScript library:**

```sh
npm install @url-sanitize/core @url-sanitize/clearurls
```

**npm CLI:**

```sh
npm install -g @url-sanitize/cli
npx @url-sanitize/cli "https://example.com/?utm_source=x"
```

**Rust library / native CLI:**

```sh
cargo add url-sanitize-core
cargo install url-sanitize
```

## TypeScript Quick Start

```ts
import { sanitize } from '@url-sanitize/clearurls';

const result = sanitize('https://example.com/article?utm_source=newsletter&id=123');

console.log(result);
// {
//   kind: 'cleaned',
//   original: 'https://example.com/article?utm_source=newsletter&id=123',
//   url: 'https://example.com/article?id=123',
//   strippedParams: ['utm_source'],
//   matchedRules: [{ provider: 'globalRules', kind: 'strip-param', pattern: 'utm_.*' }]
// }
```

**Custom catalog or options:**

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';

const sanitize = compileSanitizer(clearurlsCatalog, { stripReferralMarketing: true });
```

## CLI Quick Start

```sh
url-sanitize "https://example.com/article?utm_source=newsletter&id=123"
# https://example.com/article?id=123

url-sanitize --json "https://www.google.com/url?q=https%3A%2F%2Fexample.org"
# {"kind":"redirected","original":"...","url":"https://example.org/","via":{...}}
```

## Rust Quick Start

```rust
use url_sanitize_core::{Catalog, SanitizerOptions};

let json = std::fs::read_to_string("catalog/clearurls.json")?;
let catalog = Catalog::from_json(&json)?;
let sanitizer = catalog.compile(SanitizerOptions::default());
let result = sanitizer.sanitize("https://example.com/?utm_source=x");

println!("{}", serde_json::to_string(&result)?);
```

## Packages

| Package | Description | License |
| --- | --- | --- |
| [`@url-sanitize/core`](packages/core) | Pure TypeScript sanitization engine. Zero runtime deps. | MIT |
| [`@url-sanitize/clearurls`](packages/clearurls) | ClearURLs-compatible catalog + adapter. | MIT (code) + LGPL-3.0-only (data) |
| [`@url-sanitize/cli`](packages/cli) | npm command-line URL sanitizer. | MIT |
| [`url-sanitize-core`](crates/url-sanitize-core) | Pure-Rust sanitization engine. | MIT |
| [`url-sanitize`](crates/url-sanitize) | Native Rust CLI with embedded ClearURLs catalog. | MIT |
| `@url-sanitize/fetch` | (coming v0.2) Fetch + hash-verify remote catalogs. | MIT |
| `@url-sanitize/action` | (coming v0.3) GitHub Action for PR / docs hygiene. | MIT |

## GitHub Automation

- `ci.yml` verifies TypeScript build, typecheck, lint, tests, generated catalog freshness, generated conformance freshness, Rust build, Rust tests, and release binary size.
- `sync-clearurls.yml` checks upstream ClearURLs daily and opens a version-bump PR when rules change.
- `auto-tag.yml` creates annotated release tags after package version bumps.
- `release.yml` publishes npm packages and Rust crates from `v*` tags.

## Compared to existing options

| Option | Tradeoffs |
| --- | --- |
| ClearURLs browser extension | End-user product, not a library. |
| `@quik-fe/clear-urls` | AGPL-3.0-only — adoption-blocker for SaaS / commercial. |
| Hand-rolled per-project regexes | Stale within months; no upstream rule sync. |
| **url-sanitize** | MIT engine, daily-synced rules, explainable results, no AGPL. |

## Docs

- [Threat model](docs/threat-model.md) — what hash verification proves and what it doesn't
- [License model](docs/license-model.md) — why core is MIT and rules data is LGPL-3.0
- [ClearURLs compatibility](docs/clearurls-compat.md) — migrating from ClearURLs / `@quik-fe/clear-urls`
- [Non-goals](docs/non-goals.md) — what this project will never do

## Roadmap

- **v0.1** — TypeScript engine, ClearURLs adapter, npm CLI, Rust engine, Rust CLI, shared conformance, daily sync workflow
- **v0.2** — `fetch` package, remote catalog verification, richer CLI install docs
- **v0.3** — `action` package for GH PR / docs hygiene
- **v0.4** — custom user-defined catalogs, schema validation
- **v1.0** — stable public API + result types + benchmarks + security policy
- **v2.0** — multi-source: AdGuard URL Tracking, Brave Debouncer, Firefox query-strip

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT for engine + CLI + tooling. LGPL-3.0-only for ClearURLs-derived data in `@url-sanitize/clearurls`. See [LICENSE](LICENSE) and [docs/license-model.md](docs/license-model.md).
