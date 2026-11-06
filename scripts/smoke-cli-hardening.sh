#!/usr/bin/env bash
# Hostile-input checks for a url-sanitize CLI built from this checkout.
# Kept out of smoke-cli.sh, which also runs against already-published
# binaries that predate these fixes.
set -euo pipefail

bin="${1:?usage: smoke-cli-hardening.sh <url-sanitize binary>}"

fail() {
  echo "hardening smoke failed for $bin: $*" >&2
  exit 1
}

# `--` ends options, so flag-like input is treated as a URL.
[[ "$("$bin" -- --help)" == "--help" ]] || fail '`-- --help` should echo --help'
[[ "$("$bin" -- -)" == "-" ]] || fail '`-- -` should echo -'

# Control characters in echoed input are percent-encoded, not sent raw to the terminal.
out="$(printf 'not a url \033[31mRED\n' | "$bin")"
[[ "$out" == 'not a url %1B[31mRED' ]] || fail "escape sequence reached output: $(printf %q "$out")"

# An invalid UTF-8 line doesn't end the batch.
out="$(printf 'https://a.com/?utm_source=1\n\377\nhttps://b.com/?utm_source=2\n' | "$bin")"
[[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" == 3 ]] || fail "lines after invalid UTF-8 were dropped: $out"
[[ "$(printf '%s\n' "$out" | tail -n 1)" == "https://b.com/" ]] || fail "last URL not cleaned: $out"

# A slow reader still gets every line. Unparseable lines skip rule matching,
# so this stays fast in a debug build while overflowing the pipe buffer.
count=20000
pad="$(printf 'x%.0s' {1..60})"
lines="$(
  for ((i = 0; i < count; i++)); do echo "line-$i-$pad"; done |
    "$bin" | (sleep 1; wc -l) | tr -d ' '
)"
[[ "$lines" == "$count" ]] || fail "slow pipe got $lines of $count lines"

# A reader that closes early ends the run quietly with exit 0.
set +o pipefail
for ((i = 0; i < count; i++)); do echo "line-$i-$pad"; done |
  "$bin" 2> /dev/null | head -n 1 > /dev/null
status="${PIPESTATUS[1]}"
set -o pipefail
[[ "$status" == 0 ]] || fail "exit $status after the reader closed early"

echo "hardening smoke passed for $bin"
