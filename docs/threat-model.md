# Threat model

This document describes what integrity guarantees `url-sanitize` provides — and crucially, what it does *not*.

## What we verify

The `@url-sanitize/clearurls` package ships a bundled snapshot of the ClearURLs ruleset. When that snapshot is updated (via the daily sync workflow, or via `@url-sanitize/fetch` at runtime), we verify:

1. **TLS transport integrity** — HTTPS connection to `https://rules2.clearurls.xyz/` (served from GitHub Pages)
2. **SHA256 consistency** — the downloaded JSON's SHA256 hex digest matches the content of `rules.minify.hash` fetched from the same origin

Mismatch = abort + retry (cache-control timing on the hash file is 600s, so transient mismatches happen).

## What we do NOT verify

- **Provenance.** The rules file and the hash file are served from the same origin. A compromised upstream origin (compromised GitHub Pages, compromised ClearURLs project credentials, MITM with a forged TLS cert) produces both a malicious rules file and a matching malicious hash file. Hash verification only proves consistency, not authenticity.
- **Maintainer identity.** ClearURLs does **not** sign their rules files. No minisign, no GPG, no cosign. We confirmed `https://rules2.clearurls.xyz/data.minify.json.minisig` returns 404. Stricter integrity guarantees would require upstream ClearURLs maintainers to opt in to signing — not a gap this project can close unilaterally.

## What you can do for stricter deployments

For consumers who need stronger guarantees (e.g. security-sensitive SaaS, regulated environments), v0.2's `@url-sanitize/fetch` exposes a `pinnedHash` option:

```ts
import { fetchClearurlsCatalog } from '@url-sanitize/fetch';

const catalog = await fetchClearurlsCatalog({
  pinnedHash: process.env.CLEARURLS_RULES_HASH
});
```

`fetchClearurlsCatalog` refuses to return any catalog whose SHA256 doesn't match `pinnedHash`. The tradeoff: rules can go stale silently if you don't rotate the pin.

The pinned-bundle in `@url-sanitize/clearurls` is hash-checked at sync time, so for most users the bundled snapshot is already vetted up to the moment of npm publish. Hash pinning matters mainly for runtime hot-refresh scenarios.

## Reporting issues

Found a malicious rule, a ReDoS, or a verification bypass? File via `SECURITY.md` (responsible-disclosure policy, v1.0+). For now: open a private security advisory on GitHub.
