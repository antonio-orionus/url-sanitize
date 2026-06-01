#!/usr/bin/env bash
set -euo pipefail

bin="${1:-url-sanitize}"
expected_version="${2:-}"
expected_catalog_hash="${3:-}"

test_url="https://example.com/article?utm_source=newsletter&id=123"
expected_url="https://example.com/article?id=123"

version_output="$("$bin" --version)"
if [[ ! "$version_output" =~ ^url-sanitize[[:space:]]+([^[:space:]]+)[[:space:]]+\(catalog[[:space:]]+([0-9a-fA-F]{64})[[:space:]]+([^\)]+)\)$ ]]; then
  echo "unexpected --version output: $version_output" >&2
  exit 1
fi

actual_version="${BASH_REMATCH[1]}"
actual_catalog_hash="${BASH_REMATCH[2]}"
actual_catalog_date="${BASH_REMATCH[3]}"

if [[ -n "$expected_version" && "$actual_version" != "$expected_version" ]]; then
  echo "unexpected version: expected $expected_version, got $actual_version" >&2
  exit 1
fi

if [[ ! "$actual_catalog_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$ ]]; then
  echo "unexpected catalog date: $actual_catalog_date" >&2
  exit 1
fi

if [[ -n "$expected_catalog_hash" && "$actual_catalog_hash" != "$expected_catalog_hash" ]]; then
  echo "unexpected catalog hash: expected $expected_catalog_hash, got $actual_catalog_hash" >&2
  exit 1
fi

default_output="$("$bin" "$test_url")"
if [[ "$default_output" != "$expected_url" ]]; then
  echo "unexpected default output: $default_output" >&2
  exit 1
fi

json_output="$("$bin" --json "$test_url")"
case "$json_output" in
  *'"kind":"cleaned"'*'"url":"https://example.com/article?id=123"'*'"strippedParams":["utm_source"]'*) ;;
  *)
    echo "unexpected --json output: $json_output" >&2
    exit 1
    ;;
esac

stdin_output="$(printf '%s\n' "$test_url" | "$bin" -)"
if [[ "$stdin_output" != "$expected_url" ]]; then
  echo "unexpected stdin output: $stdin_output" >&2
  exit 1
fi

echo "smoke passed for $bin ($actual_version catalog $actual_catalog_hash $actual_catalog_date)"
