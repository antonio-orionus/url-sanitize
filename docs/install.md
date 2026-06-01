# Install

`url-sanitize` ships both a pure TypeScript npm CLI and a native Rust CLI. Use
the native CLI when you want the smallest standalone binary; use npm when Node
is already the toolchain you have.

## Quick Matrix

| Platform | Recommended command | Notes |
| --- | --- | --- |
| Any OS with Node.js | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | No native binary. |
| Any OS with Rust | `cargo install url-sanitize` | Builds from crates.io. |
| Linux x64 / ARM64 | Shell installer below | Installs the native binary and verifies `SHA256SUMS`. |
| macOS Apple Silicon | Shell installer below | Installs the native binary and verifies `SHA256SUMS`. |
| macOS Intel | Shell installer below | Installs the native binary and verifies `SHA256SUMS`. |
| Windows x64 | PowerShell installer below | Installs the native binary and verifies `SHA256SUMS`. |
| Windows ARM64 | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | Native release archives are not published yet. |
| Python | `pip install url-sanitize` plus one native CLI install above | Python shells out to `url-sanitize` on `PATH`, or `URL_SANITIZE_BIN`. |

## Direct Installers

Linux x64/ARM64, macOS Apple Silicon/Intel:

```sh
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.sh | sh
```

Windows x64 PowerShell:

```powershell
irm https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.ps1 | iex
```

## Package Managers

### Homebrew

The public tap is `antonio-orionus/homebrew-url-sanitize`:

```sh
brew install antonio-orionus/url-sanitize/url-sanitize
```

The repository also includes a validation fixture at
[`Formula/url-sanitize.rb`](../Formula/url-sanitize.rb). The release workflow
publishes a generated copy to the tap from each release `SHA256SUMS`.

```sh
brew install --formula ./Formula/url-sanitize.rb
```

The published formula supports macOS Apple Silicon/Intel and Linux x64/ARM64
release archives.

### Scoop

The public bucket is `antonio-orionus/scoop-url-sanitize`:

```powershell
scoop bucket add url-sanitize https://github.com/antonio-orionus/scoop-url-sanitize
scoop install url-sanitize
```

The repository also includes a validation fixture at
[`bucket/url-sanitize.json`](../bucket/url-sanitize.json). CI installs this
manifest with Scoop on Windows.

```powershell
scoop install .\bucket\url-sanitize.json
```

The manifest currently supports Windows x64.

## CI And Containers

For CI, prefer a pinned release instead of `latest`:

```sh
version="v0.1.4"
target="x86_64-unknown-linux-gnu"
asset="url-sanitize-${target}.tar.gz"

curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
grep "  ${asset}$" SHA256SUMS | sha256sum -c -
tar -xzf "${asset}"
./url-sanitize --version
```

For Node-based CI, `npx @url-sanitize/cli` is usually simpler.

### GitHub Actions

```yaml
jobs:
  url-sanitize:
    runs-on: ubuntu-latest
    steps:
      - name: Install url-sanitize
        run: |
          set -euo pipefail
          version="v0.1.4"
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

### GitLab CI

```yaml
url-sanitize:
  image: ubuntu:24.04
  before_script:
    - apt-get update
    - apt-get install -y --no-install-recommends ca-certificates curl coreutils tar
  script:
    - |
      set -eu
      version="v0.1.4"
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

### Dockerfile

```Dockerfile
FROM ubuntu:24.04

ARG URL_SANITIZE_VERSION=v0.1.4
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

### Package-Manager CI

Use Homebrew or Scoop in CI when that ecosystem is already present in the
runner image:

```sh
brew install antonio-orionus/url-sanitize/url-sanitize
url-sanitize --version
```

```powershell
scoop bucket add url-sanitize https://github.com/antonio-orionus/scoop-url-sanitize
scoop install url-sanitize
url-sanitize --version
```
