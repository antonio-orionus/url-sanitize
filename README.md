# url-sanitize

[![ci](https://github.com/antonio-orionus/url-sanitize/actions/workflows/ci.yml/badge.svg)](https://github.com/antonio-orionus/url-sanitize/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40url-sanitize%2Fmerged)](https://www.npmjs.com/package/@url-sanitize/merged)
[![crates.io](https://img.shields.io/crates/v/url-sanitize)](https://crates.io/crates/url-sanitize)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Remove tracking parameters and unwrap tracking redirects from URLs using ClearURLs, AdGuard, Brave, and Firefox rules.

**Looking for ClearURLs behavior as a library or CLI?** `url-sanitize` removes tracking noise like `utm_*`, `fbclid`, and redirect wrappers from a merged, daily-synced catalog of four upstream rule sources.

Available from npm, crates.io, native release binaries, Python, CI environments, workers, browsers, edge runtimes, Node.js, Bun, and Deno.

- **One behavior contract across languages.** TypeScript and Rust implementations are checked against the same JSONL conformance corpus.
- **Explainable results.** Stripped params, redirect provider, or block rule are included — no opaque string replacement.
- **Multi-source without AGPL lock-in.** Engine and CLI are MIT; upstream rule data keeps its source license.
- **Automation-friendly.** The Rust CLI is deterministic, prompt-free, supports `--json`, and embeds a pinned catalog.
- **Fresh rules.** GitHub Actions syncs ClearURLs, AdGuard, Brave, and Firefox catalogs daily; releases publish npm packages, crates, Python wheels, and native binaries automatically.

## Contents

- [Install](#install)
- [TypeScript Quick Start](#typescript-quick-start)
- [CLI Quick Start](#cli-quick-start)
- [Rust Quick Start](#rust-quick-start)
- [Packages](#packages)
- [GitHub Automation](#github-automation)
- [Docs](#docs)
- [Roadmap](#roadmap)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Install

**Fastest path:**

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
npm install @url-sanitize/merged
npm install @url-sanitize/core @url-sanitize/clearurls @url-sanitize/adguard @url-sanitize/brave @url-sanitize/firefox
npm install @url-sanitize/fetch
cargo install url-sanitize
cargo add url-sanitize-core
pip install url-sanitize
```

The Python package shells out to the native CLI binary, so install `url-sanitize` with one of the native paths above.

### Install Matrix

| Platform | Command | Notes |
| --- | --- | --- |
| Any OS with Node.js | `npx @url-sanitize/cli "..."` | No native binary required |
| Any OS with Rust | `cargo install url-sanitize` | Builds from crates.io |
| Linux x64 / ARM64 | Shell installer | Installs native binary and verifies `SHA256SUMS` |
| macOS Apple Silicon / Intel | Shell installer | Installs native binary and verifies `SHA256SUMS` |
| Windows x64 | PowerShell installer | Installs native binary and verifies `SHA256SUMS` |
| Windows ARM64 | `npx @url-sanitize/cli "..."` | Native release archives not yet published |
| Python | `pip install url-sanitize` + native CLI | Python shells out to `url-sanitize` on `PATH`, or `URL_SANITIZE_BIN` |

### Homebrew and Scoop

```sh
brew install antonio-orionus/url-sanitize/url-sanitize
```

```powershell
scoop bucket add url-sanitize https://github.com/antonio-orionus/scoop-url-sanitize
scoop install url-sanitize
```

Homebrew supports macOS Apple Silicon/Intel and Linux x64/ARM64. Scoop supports Windows x64. Release automation renders Homebrew and Scoop metadata from the published `SHA256SUMS`; validation fixtures are kept at [`Formula/url-sanitize.rb`](Formula/url-sanitize.rb) and [`bucket/url-sanitize.json`](bucket/url-sanitize.json).

### CI and Containers

For CI, pin a version instead of using `latest`:

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

      - name: Smoke test
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

```dockerfile
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

**ClearURLs-only behavior:**

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
| [`@url-sanitize/merged`](packages/merged) | Default merged multi-source catalog. | MIT (code) + upstream data licenses |
| [`@url-sanitize/clearurls`](packages/clearurls) | ClearURLs-compatible catalog + adapter. | MIT (code) + LGPL-3.0-only (data) |
| [`@url-sanitize/adguard`](packages/adguard) | AdGuard URL Tracking Protection catalog + adapter. | LGPL-3.0-only |
| [`@url-sanitize/brave`](packages/brave) | Brave Debouncer catalog + adapter. | MPL-2.0 |
| [`@url-sanitize/firefox`](packages/firefox) | Firefox Query Stripping catalog + adapter. | MPL-2.0 |
| [`@url-sanitize/cli`](packages/cli) | npm CLI for removing tracking parameters and redirect wrappers. | MIT |
| [`@url-sanitize/fetch`](packages/fetch) | Runtime ClearURLs catalog fetch with SHA256 and pinned-hash verification. | MIT |
| [`url-sanitize-core`](crates/url-sanitize-core) | Pure-Rust implementation. | MIT |
| [`url-sanitize`](crates/url-sanitize) | Native Rust CLI with embedded merged catalog. | MIT |
| [`url-sanitize`](python) | Python wrapper around the native CLI. | MIT |
| `@url-sanitize/action` | GitHub Action for URL hygiene in PRs and docs. (Planned — not yet published.) | MIT |

## Compared to Existing Options

| Option | Tradeoffs |
| --- | --- |
| ClearURLs browser extension | End-user product, not a library |
| `@quik-fe/clear-urls` | AGPL-3.0-only — adoption-blocker for SaaS and commercial use |
| Hand-rolled per-project regexes | Stale within months; no upstream rule sync |
| **url-sanitize** | MIT engine, daily-synced multi-source rules, explainable results |

## GitHub Automation

- `ci.yml` — builds, typechecks, lints, tests, checks generated catalog and conformance freshness, runs Rust fmt/clippy/tests/package checks, validates release binary size, and runs npm/Python/installer/Homebrew/Scoop smoke tests.
- `sync-clearurls.yml` — syncs upstream rule sources daily and opens a version-bump PR when rules change.
- `release-dry-run.yml` — builds the release matrix on PRs, assembles archives, renders Homebrew/Scoop metadata, and validates installer/package-manager syntax before merge.
- `auto-tag.yml` — verifies release metadata, creates annotated tags after version bumps land on `main`, and dispatches `release.yml`.
- `release.yml` — publishes npm packages, Rust crates, PyPI package, native GitHub Release assets, Homebrew/Scoop metadata, and runs public smoke tests from `v*` tags.
- `post-release-smoke.yml` — available for manual public smoke reruns against an already-published version.

Publishing to Homebrew tap and Scoop bucket repositories requires a `PACKAGING_REPO_TOKEN` secret. The optional `HOMEBREW_TAP_REPO` and `SCOOP_BUCKET_REPO` repository variables override defaults (`antonio-orionus/homebrew-url-sanitize` and `antonio-orionus/scoop-url-sanitize`). If the token is absent, release automation skips external package-manager publication.

## Docs

- [Roadmap](docs/roadmap.md) — milestone detail, deferred surfaces, and strategic context
- [Behavioral spec](docs/spec.md) — result schema and implementation contract
- [Benchmarks](docs/benchmarks.md) — current sanitizer throughput numbers
- [Threat model](docs/threat-model.md) — what hash verification proves and what it doesn't
- [License model](docs/license-model.md) — why the engine is MIT and rule data is LGPL-3.0
- [ClearURLs compatibility](docs/clearurls-compat.md) — migrating from ClearURLs or `@quik-fe/clear-urls`
- [Non-goals](docs/non-goals.md) — what this project will never do
- [Security policy](SECURITY.md) — responsible disclosure and supported versions

## Roadmap

- **v0.1** — TypeScript engine, ClearURLs adapter, npm CLI, Rust engine, Rust CLI, shared conformance, daily sync workflow ✓
- **v0.2** — broader native archive coverage, installer refinements, Homebrew/Scoop, CI install examples ✓
- **v0.3** — runtime catalog fetching, custom user-defined catalogs, schema validation ✓
- **v1.0** — stable public API, result types, benchmarks, security policy ✓
- **v2.0** — multi-source packages: AdGuard, Brave, Firefox, merged catalog ✓
- **Deferred** — GitHub Action, MCP, AUR/Winget/distro packages, native npm packages, WASM, in-process Python bindings

## Development

Requires Node.js ≥ 22 and pnpm. Rust toolchain required for crate targets (MSRV 1.75).

```sh
git clone https://github.com/antonio-orionus/url-sanitize.git
cd url-sanitize
pnpm install
pnpm build       # tsup build all packages
pnpm test        # vitest
pnpm typecheck
pnpm lint
cargo test --workspace
```

Upstream rule catalogs sync automatically via `sync-clearurls.yml`. To pull them manually:

```sh
pnpm sync:sources
```

Pre-push hook runs: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `cargo package -p url-sanitize-core --allow-dirty`.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT for engine, CLI, and tooling. Bundled upstream rule data keeps its source license: ClearURLs and AdGuard data are LGPL-3.0-only; Brave and Firefox data are MPL-2.0. See [LICENSE](LICENSE) and [docs/license-model.md](docs/license-model.md).
