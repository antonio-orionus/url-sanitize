#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: scripts/verify-release-attestations.sh <version>}"
repo="${GITHUB_REPOSITORY:-antonio-orionus/url-sanitize}"
tag="${version#v}"
tag="v${tag}"
tmp="${RUNNER_TEMP:-$(mktemp -d)}/url-sanitize-attestations"

mkdir -p "$tmp/assets"
node scripts/release-platforms.mjs --expected-assets > "$tmp/assets.txt"
{
  echo "url-sanitize-installer.sh"
  echo "url-sanitize-installer.ps1"
  echo "SHA256SUMS"
} >> "$tmp/assets.txt"

while IFS= read -r asset; do
  path="$tmp/assets/$asset"
  curl --proto '=https' --tlsv1.2 -fsSL \
    "https://github.com/${repo}/releases/download/${tag}/${asset}" \
    -o "$path"
  gh attestation verify "$path" -R "$repo"
done < "$tmp/assets.txt"
