#!/usr/bin/env sh
set -eu

pnpm build
pnpm lint
pnpm typecheck
pnpm test

cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

cargo package -p url-sanitize-core --allow-dirty
