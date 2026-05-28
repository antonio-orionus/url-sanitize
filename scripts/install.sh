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

mkdir -p "$install_dir"
curl --proto '=https' --tlsv1.2 -fsSL "$url" -o "$tmp/$asset"
tar -xzf "$tmp/$asset" -C "$tmp"
install -m 0755 "$tmp/url-sanitize" "$install_dir/url-sanitize"

echo "installed url-sanitize to $install_dir/url-sanitize"
