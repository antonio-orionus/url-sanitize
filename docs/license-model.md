# License model

`url-sanitize` deliberately splits licenses across packages so commercial and open-source consumers can both adopt it.

## Per-package licenses

| Package | License | Why |
| --- | --- | --- |
| `@url-sanitize/core` | **MIT** | Clean-room algorithm port. No code derived from ClearURLs Addon. |
| `@url-sanitize/clearurls` | **MIT (code) + LGPL-3.0-only (data)** | Adapter code is fresh; bundled `data.json` is derived from ClearURLs Rules repo, which is LGPL-3.0. |
| `@url-sanitize/cli` | **MIT** | Wraps `core` + `clearurls`. CLI tool itself is fresh code. |
| `@url-sanitize/fetch` | **MIT** | Network + hash-verify utilities. Fresh code. |
| `@url-sanitize/action` | **MIT** | GH Action wrapping CLI. Fresh code. |

## What this means for consumers

### "I want to use this in a closed-source / commercial SaaS"

- Use `@url-sanitize/core` directly — MIT, no copyleft.
- Use `@url-sanitize/clearurls` if LGPL-3.0 on the bundled data file is acceptable. LGPL on a data file (not linked code) is generally fine for non-derivative use, but consult your legal team if unsure.
- Or: write your own catalog (plain TypeScript literal of `SanitizerCatalog`) and skip `@url-sanitize/clearurls` entirely. No LGPL surface.

### "I'm building an open-source project"

- Use whatever license you want. Both MIT and LGPL are compatible with most OSS licenses (GPL-2.0, GPL-3.0, MIT, Apache-2.0, BSD).

### "I'm worried about AGPL"

- `url-sanitize` is **not** AGPL. The competing `@quik-fe/clear-urls` package is AGPL-3.0-only, which triggers network-use copyleft (running it on a server = obligation to open-source your server). We deliberately avoid AGPL to unlock SaaS adoption.

## Why the bundled data is LGPL, not MIT

The ClearURLs Rules repository (https://github.com/ClearURLs/Rules) is licensed LGPL-3.0-only. We reproduce their data under the same license to respect upstream's terms. Re-licensing it MIT would be license laundering and we won't do it.

Algorithm code is a different story: the ClearURLs algorithm is a public specification (see https://docs.clearurls.xyz/). Writing a fresh TypeScript implementation against the spec is clean-room reverse engineering — we owe no license obligation to the original Addon's LGPL code because we never read it. That's why `@url-sanitize/core` is MIT.

## Trademark note

"ClearURLs" is a trademark of its respective authors. This project is **not** an official ClearURLs project, **not** endorsed by the ClearURLs maintainers, and uses the name "ClearURLs" only in a descriptive capacity ("ClearURLs-compatible rules", "rules derived from ClearURLs"). See `packages/clearurls/NOTICE`.
