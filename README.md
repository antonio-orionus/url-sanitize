# url-sanitize

> TypeScript URL sanitization toolkit with ClearURLs-compatible rules, explainable results, and pluggable rule sources.

**Looking for ClearURLs in TypeScript?** You're in the right place. `@url-sanitize/clearurls` ships the ClearURLs-compatible ruleset with daily upstream sync, MIT-licensed engine, and explainable results that tell you exactly which rule changed your URL.

Works in Node.js, Bun, Deno, browsers, workers, CLIs, GitHub Actions, and edge runtimes.

## Install

```sh
npm install @url-sanitize/core @url-sanitize/clearurls
```

## Quick start

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

## Packages

| Package | Description | License |
| --- | --- | --- |
| [`@url-sanitize/core`](packages/core) | Pure sanitization engine. Zero deps. | MIT |
| [`@url-sanitize/clearurls`](packages/clearurls) | ClearURLs-compatible catalog + adapter. | MIT (code) + LGPL-3.0-only (data) |
| [`@url-sanitize/cli`](packages/cli) | Command-line URL sanitizer. | MIT |
| [`url-sanitize-core`](crates/url-sanitize-core) | Rust port of the sanitization engine. Zero deps beyond `regex-lite`, `url`, `serde`. | MIT |
| [`url-sanitize`](crates/url-sanitize) | Rust CLI — sub-1MB native binary with embedded catalog. | MIT |
| `@url-sanitize/fetch` | (coming v0.2) Fetch + hash-verify remote catalogs. | MIT |
| `@url-sanitize/action` | (coming v0.3) GitHub Action for PR / docs hygiene. | MIT |

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

- **v0.1** — `core` + `clearurls` + minimal `cli` + daily sync workflow
- **v0.2** — `fetch` package, CLI `--stdin` / `--json` / `--explain`
- **v0.3** — `action` package for GH PR / docs hygiene
- **v0.4** — custom user-defined catalogs, schema validation
- **v1.0** — stable public API + result types + benchmarks + security policy
- **v2.0** — multi-source: AdGuard URL Tracking, Brave Debouncer, Firefox query-strip

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT for engine + CLI + tooling. LGPL-3.0-only for ClearURLs-derived data in `@url-sanitize/clearurls`. See [LICENSE](LICENSE) and [docs/license-model.md](docs/license-model.md).
