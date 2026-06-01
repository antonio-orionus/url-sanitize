#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
PYTHON="${PYTHON:-python3}"
trap 'rm -rf "$TMP"' EXIT

test_url="https://example.com/article?utm_source=newsletter&id=123"
expected_url="https://example.com/article?id=123"

cd "$ROOT"

echo "==> Build TypeScript packages"
pnpm build

echo "==> Build Rust CLI"
cargo build -p url-sanitize

cli_version="$(node -p "require('./packages/cli/package.json').version")"
crate_version="$(cargo metadata --no-deps --format-version=1 | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { const json = JSON.parse(data); console.log(json.packages.find((pkg) => pkg.name === 'url-sanitize')?.version); });")"

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

  "$ROOT/scripts/smoke-cli.sh" "./node_modules/.bin/url-sanitize" "$cli_version"
)

echo "==> Smoke Python wheel wrapper"
"$PYTHON" -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install --upgrade pip build
"$TMP/venv/bin/python" -m build --wheel --outdir "$TMP/python-dist" "$ROOT"
"$TMP/venv/bin/python" -m pip install "$TMP"/python-dist/url_sanitize-*.whl

rust_bin="$ROOT/target/debug/url-sanitize"
"$ROOT/scripts/smoke-cli.sh" "$rust_bin" "$crate_version"

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
    "$test_url"
)"
if [[ "$python_output" != "$expected_url" ]]; then
  echo "unexpected Python module output: $python_output" >&2
  exit 1
fi

python_version_output="$(URL_SANITIZE_BIN="$rust_bin" "$TMP/venv/bin/python" -m url_sanitize --version)"
rust_version_output="$("$rust_bin" --version)"
if [[ "$python_version_output" != "$rust_version_output" ]]; then
  echo "Python wrapper did not report the native CLI version/catalog" >&2
  echo "python: $python_version_output" >&2
  echo "rust:   $rust_version_output" >&2
  exit 1
fi

python_json_output="$(URL_SANITIZE_BIN="$rust_bin" "$TMP/venv/bin/python" -m url_sanitize --json "$test_url")"
case "$python_json_output" in
  *'"kind":"cleaned"'*'"url":"https://example.com/article?id=123"'*'"strippedParams":["utm_source"]'*) ;;
  *)
    echo "unexpected Python module JSON output: $python_json_output" >&2
    exit 1
    ;;
esac

python_stdin_output="$(printf '%s\n' "$test_url" | URL_SANITIZE_BIN="$rust_bin" "$TMP/venv/bin/python" -m url_sanitize -)"
if [[ "$python_stdin_output" != "$expected_url" ]]; then
  echo "unexpected Python module stdin output: $python_stdin_output" >&2
  exit 1
fi

echo "smoke checks passed"
