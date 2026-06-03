# url-sanitize

> Remove tracking parameters and unwrap tracking redirects from URLs with ClearURLs, AdGuard, Brave, and Firefox rules.

**Looking for CleanURLs / ClearURLs behavior as a library or CLI?** You're in the right place. `url-sanitize` removes tracking junk like `utm_*`, `fbclid`, and redirector wrappers, now using a merged ClearURLs / AdGuard / Brave / Firefox catalog by default.

Use it from npm, crates.io, native release binaries, Python, CI, workers, browsers, edge runtimes, Node.js, Bun, and Deno.

## Why this exists

- **One behavior contract across languages.** TypeScript and Rust implementations are checked against the same JSONL conformance corpus.
- **Explainable privacy cleanup.** Results include the stripped params, redirect provider, or block rule instead of returning an opaque string.
- **Multi-source without AGPL lock-in.** Code, CLIs, and tooling are MIT; upstream rule data keeps its source license.
- **Automation-friendly.** The Rust CLI is deterministic, prompt-free, supports `--json`, and embeds a pinned catalog.
- **Fresh rules.** GitHub Actions syncs upstream ClearURLs, AdGuard, Brave, and Firefox catalogs; release workflows publish npm packages, crates, Python wheels, and native binaries.

## Install

**Fastest CLI path:**

```sh
npx @url-sanitize/cli "https://example.com/?utm_source=x"
```

**Native binary, Linux/macOS:**

```sh
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.sh | sh
```

**Native binary, Windows x64 PowerShell:**

```powershell
irm https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.ps1 | iex
```

**Package managers and libraries:**

```sh
npm install -g @url-sanitize/cli
npm install @url-sanitize/core @url-sanitize/merged
npm install @url-sanitize/clearurls @url-sanitize/adguard @url-sanitize/brave @url-sanitize/firefox
npm install @url-sanitize/fetch
cargo install url-sanitize
cargo add url-sanitize-core
pip install url-sanitize
```

The Python package shells out to the native CLI, so install `url-sanitize` with
one of the native paths too.

### Install Matrix

| Platform | Recommended command | Notes |
| --- | --- | --- |
| Any OS with Node.js | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | No native binary. |
| Any OS with Rust | `cargo install url-sanitize` | Builds from crates.io. |
| Linux x64 / ARM64 | Shell installer above | Installs the native binary and verifies `SHA256SUMS`. |
| macOS Apple Silicon / Intel | Shell installer above | Installs the native binary and verifies `SHA256SUMS`. |
| Windows x64 | PowerShell installer above | Installs the native binary and verifies `SHA256SUMS`. |
| Windows ARM64 | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | Native release archives are not published yet. |
| Python | `pip install url-sanitize` plus one native CLI install | Python shells out to `url-sanitize` on `PATH`, or `URL_SANITIZE_BIN`. |

### Homebrew And Scoop

```sh
brew install antonio-orionus/url-sanitize/url-sanitize
```

```powershell
scoop bucket add url-sanitize https://github.com/antonio-orionus/scoop-url-sanitize
scoop install url-sanitize
```

Homebrew supports macOS Apple Silicon/Intel and Linux x64/ARM64. Scoop currently
supports Windows x64. This repository keeps validation fixtures at
[`Formula/url-sanitize.rb`](Formula/url-sanitize.rb) and
[`bucket/url-sanitize.json`](bucket/url-sanitize.json); release automation
renders published metadata from GitHub Release `SHA256SUMS`.

### CI And Containers

For CI, prefer a pinned release instead of `latest`:

```sh
version="v2.0.1"
target="x86_64-unknown-linux-gnu"
asset="url-sanitize-${target}.tar.gz"

curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
grep "  ${asset}$" SHA256SUMS | sha256sum -c -
tar -xzf "${asset}"
./url-sanitize --version
```

GitHub Actions:

```yaml
jobs:
  url-sanitize:
    runs-on: ubuntu-latest
    steps:
      - name: Install url-sanitize
        run: |
          set -euo pipefail
          version="v2.0.1"
          target="x86_64-unknown-linux-gnu"
          asset="url-sanitize-${target}.tar.gz"

          curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
          curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
          grep "  ${asset}$" SHA256SUMS | sha256sum -c -
          tar -xzf "${asset}"
          sudo install -m 0755 url-sanitize /usr/local/bin/url-sanitize

      - name: Smoke url-sanitize
        run: |
          url-sanitize --version
          url-sanitize --json "https://example.com/article?utm_source=newsletter&id=123"
          printf '%s\n' "https://example.com/article?utm_source=newsletter&id=123" | url-sanitize -
```

GitLab CI:

```yaml
url-sanitize:
  image: ubuntu:24.04
  before_script:
    - apt-get update
    - apt-get install -y --no-install-recommends ca-certificates curl coreutils tar
  script:
    - |
      set -eu
      version="v2.0.1"
      target="x86_64-unknown-linux-gnu"
      asset="url-sanitize-${target}.tar.gz"

      curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
      curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
      grep "  ${asset}$" SHA256SUMS | sha256sum -c -
      tar -xzf "${asset}"
      install -m 0755 url-sanitize /usr/local/bin/url-sanitize
    - url-sanitize --version
    - url-sanitize --json "https://example.com/article?utm_source=newsletter&id=123"
    - printf '%s\n' "https://example.com/article?utm_source=newsletter&id=123" | url-sanitize -
```

Dockerfile:

```Dockerfile
FROM ubuntu:24.04

ARG URL_SANITIZE_VERSION=v2.0.1
ARG URL_SANITIZE_TARGET=x86_64-unknown-linux-gnu

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl coreutils tar \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  asset="url-sanitize-${URL_SANITIZE_TARGET}.tar.gz"; \
  curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${URL_SANITIZE_VERSION}/${asset}"; \
  curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${URL_SANITIZE_VERSION}/SHA256SUMS"; \
  grep "  ${asset}$" SHA256SUMS | sha256sum -c -; \
  tar -xzf "${asset}"; \
  install -m 0755 url-sanitize /usr/local/bin/url-sanitize; \
  rm -f "${asset}" SHA256SUMS url-sanitize; \
  url-sanitize --version
```

## TypeScript Quick Start

```ts
import { sanitize } from '@url-sanitize/merged';

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
import { mergedCatalog } from '@url-sanitize/merged';

const sanitize = compileSanitizer(mergedCatalog, { stripReferralMarketing: true });
```

**ClearURLs-only behavior is still available:**

```ts
import { sanitize } from '@url-sanitize/clearurls';
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

let json = std::fs::read_to_string("catalog/catalog.json")?;
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
| [`@url-sanitize/adguard`](packages/adguard) | AdGuard URL Tracking Protection catalog + adapter. | LGPL-3.0-only |
| [`@url-sanitize/brave`](packages/brave) | Brave Debouncer catalog + adapter. | MPL-2.0 |
| [`@url-sanitize/firefox`](packages/firefox) | Firefox Query Stripping catalog + adapter. | MPL-2.0 |
| [`@url-sanitize/merged`](packages/merged) | Default merged multi-source catalog. | MIT metadata + upstream data licenses |
| [`@url-sanitize/cli`](packages/cli) | npm CLI for removing tracking parameters and redirect wrappers. | MIT |
| [`@url-sanitize/fetch`](packages/fetch) | Runtime ClearURLs catalog fetch + SHA256 / pinned-hash verification. | MIT |
| [`url-sanitize-core`](crates/url-sanitize-core) | Pure-Rust implementation. | MIT |
| [`url-sanitize`](crates/url-sanitize) | Native Rust CLI with embedded merged catalog. | MIT |
| [`url-sanitize`](python) | Python wrapper around the native CLI. | MIT |
| `@url-sanitize/action` | Deferred GitHub Action for downstream PR / docs hygiene. | MIT |

## GitHub Automation

- `ci.yml` verifies TypeScript build, typecheck, lint, tests, generated catalog freshness, generated conformance freshness, Rust fmt/clippy/tests/package checks, release binary size, npm/Python package smoke tests, installer smoke, and Homebrew/Scoop fixture smoke where runner support exists.
- `sync-sources` checks upstream rule sources daily and opens a version-bump PR when rules change.
- `release-dry-run.yml` builds the release matrix on PRs, assembles archives, renders Homebrew/Scoop metadata, and validates installer/package-manager syntax before merge.
- `auto-tag.yml` verifies release metadata, creates annotated release tags after package version bumps land on `main`, and explicitly dispatches `release.yml`.
- `release.yml` publishes npm packages, Rust crates, PyPI package, native GitHub Release assets, Homebrew/Scoop metadata, installer smoke tests, package-manager install smoke, and public endpoint smoke from `v*` tags.
- `post-release-smoke.yml` remains available for manual public smoke reruns against an already-published version.

Package-manager publishing uses dedicated Homebrew tap and Scoop bucket
repositories. Configure `PACKAGING_REPO_TOKEN` to write to those repos; optional
repository variables `HOMEBREW_TAP_REPO` and `SCOOP_BUCKET_REPO` override the
defaults `antonio-orionus/homebrew-url-sanitize` and
`antonio-orionus/scoop-url-sanitize`. If the token is absent, release automation
skips external package-manager publication.

## Compared to existing options

| Option | Tradeoffs |
| --- | --- |
| ClearURLs browser extension | End-user product, not a library. |
| `@quik-fe/clear-urls` | AGPL-3.0-only — adoption-blocker for SaaS / commercial. |
| Hand-rolled per-project regexes | Stale within months; no upstream rule sync. |
| **url-sanitize** | MIT engine, daily-synced rules, explainable results, no AGPL. |

## Docs

- [Roadmap](docs/roadmap.md) — milestone detail, deferred surfaces, and strategic context
- [Behavioral spec](docs/spec.md) — result schema and implementation contract
- [Benchmarks](docs/benchmarks.md) — current sanitizer throughput numbers
- [Threat model](docs/threat-model.md) — what hash verification proves and what it doesn't
- [License model](docs/license-model.md) — why core is MIT and rules data is LGPL-3.0
- [ClearURLs compatibility](docs/clearurls-compat.md) — migrating from ClearURLs / `@quik-fe/clear-urls`
- [Non-goals](docs/non-goals.md) — what this project will never do
- [Security policy](SECURITY.md) — responsible disclosure and supported versions

## Roadmap

- **v0.1** — TypeScript engine, ClearURLs adapter, npm CLI, Rust engine, Rust CLI, shared conformance, daily sync workflow
- **v0.2** — broader native archive coverage, installer refinements, Homebrew/Scoop, CI install examples
- **v0.3** — runtime catalog fetching, custom user-defined catalogs, schema validation
- **v1.0** — stable public API + result types + benchmarks + security policy
- **v2.0** — multi-source packages for AdGuard URL Tracking, Brave Debouncer, Firefox query-strip, and a merged catalog
- **Deferred** — GitHub Action, MCP, extra package managers, native npm packages, WASM, and in-process Python bindings

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT for engine + CLI + tooling. Bundled upstream rule data keeps its source license: ClearURLs and AdGuard are LGPL-3.0-only; Brave and Firefox data are MPL-2.0. See [LICENSE](LICENSE) and [docs/license-model.md](docs/license-model.md).
