#!/usr/bin/env sh
set -eu

repo="antonio-orionus/url-sanitize"
install_dir="${URL_SANITIZE_INSTALL_DIR:-$HOME/.local/bin}"

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s:$uname_m" in
  Linux:x86_64) target="x86_64-unknown-linux-gnu" ;;
  Linux:aarch64|Linux:arm64) target="aarch64-unknown-linux-gnu" ;;
  Darwin:x86_64) target="x86_64-apple-darwin" ;;
  Darwin:arm64) target="aarch64-apple-darwin" ;;
  *) echo "unsupported platform: $uname_s $uname_m" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

asset="url-sanitize-${target}.tar.gz"
url="https://github.com/${repo}/releases/latest/download/${asset}"
sums_url="https://github.com/${repo}/releases/latest/download/SHA256SUMS"

mkdir -p "$install_dir"
curl --proto '=https' --tlsv1.2 -fsSL "$sums_url" -o "$tmp/SHA256SUMS"

expected="$(awk -v asset="$asset" '$2 == asset { print $1 }' "$tmp/SHA256SUMS")"
if [ -z "$expected" ]; then
  if [ "$uname_s:$uname_m" = "Darwin:x86_64" ]; then
    echo "macOS Intel release archives are not published in the selected release yet; use \`cargo install url-sanitize\` or a newer release" >&2
    exit 1
  fi
  echo "checksum for $asset not found in SHA256SUMS" >&2
  exit 1
fi

curl --proto '=https' --tlsv1.2 -fsSL "$url" -o "$tmp/$asset"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | awk '{ print $1 }')"
else
  echo "sha256sum or shasum is required to verify $asset" >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "checksum mismatch for $asset" >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 1
fi

tar -xzf "$tmp/$asset" -C "$tmp"
install -m 0755 "$tmp/url-sanitize" "$install_dir/url-sanitize"

echo "installed url-sanitize to $install_dir/url-sanitize"

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "warning: $install_dir is not on PATH" >&2 ;;
esac
