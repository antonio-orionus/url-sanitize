#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
PYTHON="${PYTHON:-python3}"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"

echo "==> Build TypeScript packages"
pnpm build

echo "==> Build Rust CLI"
cargo build -p url-sanitize

echo "==> Pack npm packages"
mkdir -p "$TMP/npm-packages"
pnpm --dir packages/core pack --pack-destination "$TMP/npm-packages"
pnpm --dir packages/clearurls pack --pack-destination "$TMP/npm-packages"
pnpm --dir packages/cli pack --pack-destination "$TMP/npm-packages"

core_tgz="$(find "$TMP/npm-packages" -name 'url-sanitize-core-*.tgz' -print -quit)"
clearurls_tgz="$(find "$TMP/npm-packages" -name 'url-sanitize-clearurls-*.tgz' -print -quit)"
cli_tgz="$(find "$TMP/npm-packages" -name 'url-sanitize-cli-*.tgz' -print -quit)"

if [[ -z "$core_tgz" || -z "$clearurls_tgz" || -z "$cli_tgz" ]]; then
  echo "missing one or more npm package tarballs" >&2
  exit 1
fi

echo "==> Smoke installed npm library and CLI"
mkdir -p "$TMP/npm-app"
(
  cd "$TMP/npm-app"
  npm init -y >/dev/null
  npm install --ignore-scripts "$core_tgz" "$clearurls_tgz" "$cli_tgz"

  node --input-type=module <<'JS'
import { sanitize } from '@url-sanitize/clearurls';

const result = sanitize('https://example.com/article?utm_source=newsletter&id=123');
if (result.kind !== 'cleaned') {
  throw new Error(`expected cleaned result, got ${result.kind}`);
}
if (result.url !== 'https://example.com/article?id=123') {
  throw new Error(`unexpected sanitized URL: ${result.url}`);
}
if (!result.strippedParams.includes('utm_source')) {
  throw new Error(`missing stripped utm_source param: ${JSON.stringify(result)}`);
}
JS

  cli_output="$("./node_modules/.bin/url-sanitize" 'https://example.com/article?utm_source=newsletter&id=123')"
  if [[ "$cli_output" != 'https://example.com/article?id=123' ]]; then
    echo "unexpected npm CLI output: $cli_output" >&2
    exit 1
  fi

  json_output="$("./node_modules/.bin/url-sanitize" --json 'https://example.com/article?utm_source=newsletter&id=123')"
  JSON_OUTPUT="$json_output" node --input-type=module <<'JS'
import process from 'node:process';

const result = JSON.parse(process.env.JSON_OUTPUT ?? '');
if (result.kind !== 'cleaned' || result.url !== 'https://example.com/article?id=123') {
  throw new Error(`unexpected npm CLI JSON result: ${JSON.stringify(result)}`);
}
JS
)

echo "==> Smoke Python wheel wrapper"
"$PYTHON" -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install --upgrade pip build
"$TMP/venv/bin/python" -m build --wheel --outdir "$TMP/python-dist" "$ROOT"
"$TMP/venv/bin/python" -m pip install "$TMP"/python-dist/url_sanitize-*.whl

rust_bin="$ROOT/target/debug/url-sanitize"
URL_SANITIZE_BIN="$rust_bin" "$TMP/venv/bin/python" <<'PY'
from url_sanitize import sanitize

result = sanitize("https://example.com/article?utm_source=newsletter&id=123")
if result["kind"] != "cleaned":
    raise SystemExit(f"expected cleaned result, got {result['kind']}")
if result["url"] != "https://example.com/article?id=123":
    raise SystemExit(f"unexpected sanitized URL: {result['url']}")
if "utm_source" not in result["strippedParams"]:
    raise SystemExit(f"missing stripped utm_source param: {result}")
PY

python_output="$(
  URL_SANITIZE_BIN="$rust_bin" "$TMP/venv/bin/python" -m url_sanitize \
    'https://example.com/article?utm_source=newsletter&id=123'
)"
if [[ "$python_output" != 'https://example.com/article?id=123' ]]; then
  echo "unexpected Python module output: $python_output" >&2
  exit 1
fi

echo "smoke checks passed"
