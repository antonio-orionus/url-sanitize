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
| macOS Intel | `cargo install url-sanitize` for v0.1.3; shell installer after the next release | Native release automation is wired, but v0.1.3 does not include the archive. |
| Windows x64 | PowerShell installer below | Installs the native binary and verifies `SHA256SUMS`. |
| Windows ARM64 | `npx @url-sanitize/cli "https://example.com/?utm_source=x"` | Native release archives are not published yet. |
| Python | `pip install url-sanitize` plus one native CLI install above | Python shells out to `url-sanitize` on `PATH`, or `URL_SANITIZE_BIN`. |

## Direct Installers

Linux x64/ARM64, macOS Apple Silicon, and macOS Intel after the first
post-v0.1.3 release:

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

The published v0.1.3 formula supports macOS Apple Silicon and Linux x64/ARM64
release archives. Intel macOS archive generation is wired for the next release.

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

## CI

For CI, prefer a pinned release instead of `latest`:

```sh
version="v0.1.3"
target="x86_64-unknown-linux-gnu"
asset="url-sanitize-${target}.tar.gz"

curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/${asset}"
curl --proto '=https' --tlsv1.2 -fsSLO "https://github.com/antonio-orionus/url-sanitize/releases/download/${version}/SHA256SUMS"
grep "  ${asset}$" SHA256SUMS | sha256sum -c -
tar -xzf "${asset}"
./url-sanitize --version
```

For Node-based CI, `npx @url-sanitize/cli` is usually simpler.
