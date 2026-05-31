# Install

`url-sanitize` ships both a pure TypeScript npm CLI and a native Rust CLI. Use
the native CLI when you want the smallest standalone binary; use npm when Node
is already the toolchain you have.

## Quick Matrix

| Platform | Recommended command | Notes |
| --- | --- | --- |
| Any OS with Node.js | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | No native binary. |
| Any OS with Rust | `cargo install url-sanitize` | Builds from crates.io. |
| Linux x64 / ARM64 | `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.sh \| sh` | Installs the native binary and verifies `SHA256SUMS`. |
| macOS Apple Silicon | `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.sh \| sh` | Installs the native binary and verifies `SHA256SUMS`. |
| macOS Intel | `cargo install url-sanitize` | Native release archives are not published yet. |
| Windows x64 | `irm https://github.com/antonio-orionus/url-sanitize/releases/latest/download/url-sanitize-installer.ps1 \| iex` | Installs the native binary and verifies `SHA256SUMS`. |
| Windows ARM64 | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | Native release archives are not published yet. |
| Python | `pip install url-sanitize` plus one native CLI install above | Python shells out to `url-sanitize` on `PATH`, or `URL_SANITIZE_BIN`. |

## Package Manager Status

### Homebrew

Homebrew is planned for v0.2, but there is not a dedicated public tap yet. For
now, use the direct installer or `cargo install url-sanitize`.

The repository includes a candidate formula at
[`Formula/url-sanitize.rb`](../Formula/url-sanitize.rb) so CI can validate the
packaging shape. The release workflow can publish a generated copy to a tap once
`PACKAGING_REPO_TOKEN` and the tap repo are configured. For local maintainer
testing only:

```sh
brew install --formula ./Formula/url-sanitize.rb
```

That formula currently supports macOS Apple Silicon and Linux x64/ARM64 release
archives. macOS Intel users should use `cargo install url-sanitize` until an
Intel macOS archive is published.

### Scoop

Scoop is planned for v0.2, but there is not a dedicated public bucket yet. For
now, use the PowerShell installer.

The repository includes a candidate manifest at
[`bucket/url-sanitize.json`](../bucket/url-sanitize.json) so CI can validate the
packaging shape. The release workflow can publish a generated copy to a bucket
once `PACKAGING_REPO_TOKEN` and the bucket repo are configured. For local
maintainer testing only:

```powershell
scoop install .\bucket\url-sanitize.json
```

The manifest currently supports Windows x64.

## CI

For CI, prefer a pinned release instead of `latest`:

```sh
version="v0.1.2"
target="x86_64-unknown-linux-gnu"
asset="url-sanitize-${target}.tar.gz"

curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
grep "  ${asset}$" SHA256SUMS | sha256sum -c -
tar -xzf "${asset}"
./url-sanitize --version
```

For Node-based CI, `npx @url-sanitize/cli` is usually simpler.
