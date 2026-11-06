# License model

`url-sanitize` deliberately splits licenses across packages so commercial and open-source consumers can both adopt it.

## Per-package licenses

The `license` field of each package uses the SPDX expression in the second column.

| Package | License | Why |
| --- | --- | --- |
| `@url-sanitize/core` | **MIT** | Clean-room algorithm port. No code derived from ClearURLs Addon. |
| `@url-sanitize/clearurls` | **MIT AND LGPL-3.0-only** | Adapter code is MIT; bundled `data.json` is derived from the ClearURLs Rules repo, which is LGPL-3.0. |
| `@url-sanitize/adguard` | **MIT AND GPL-3.0-only** | Adapter code is MIT; the bundled URL Tracking filter's header names AdGuard Filters' license, GPL-3.0. **Opt-in: not part of the default catalog.** |
| `@url-sanitize/brave` | **MIT AND MPL-2.0** | Adapter code is MIT; the bundled Debouncer, query-filter and clean-URLs lists are from `brave/adblock-lists`, licensed MPL-2.0. |
| `@url-sanitize/firefox` | **MIT AND MPL-2.0** | Adapter code is MIT; the bundled Query Stripping records are Mozilla Remote Settings data, labelled MPL-2.0 here. The Remote Settings endpoint states no license, so this label is unverified. |
| `@url-sanitize/merged` | **MIT** | Merge code only. It depends on the ClearURLs, Brave and Firefox packages and copies no data. AdGuard is not a dependency. |
| `@url-sanitize/cli` | **MIT** | Wraps `core` + `merged`. CLI tool itself is fresh code. |
| `@url-sanitize/fetch` | **MIT** | Network + hash-verify utilities. Fresh code. |
| `url-sanitize-core` (crate) | **MIT** | Rust engine. No rule data. |
| `url-sanitize` (crate, native binary, Homebrew, Scoop, release archives) | **MIT AND LGPL-3.0-only AND MPL-2.0** | The binary embeds the default catalog: ClearURLs (LGPL-3.0) plus Brave and Firefox (MPL-2.0). Archives ship `LICENSE`, `NOTICE` and `LICENSES/`. |
| `url-sanitize` (PyPI) | **MIT** | Wrapper that runs a separately installed binary. Ships no rule data. |
| `@url-sanitize/action` | **MIT** | Deferred downstream Action wrapping CLI if demand appears. Fresh code. |

Each package with bundled data ships the full license text in `LICENSES/`. The
repository root keeps the canonical copies, and CI checks that every copy
matches.

## Why AdGuard is opt-in

Through v2.1 the AdGuard data was labelled LGPL-3.0, after the FiltersRegistry
repository it is fetched from. The filter file itself says otherwise: its header
reads `License: https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE`,
which is GPL-3.0.

GPL-3.0 is strong copyleft. Embedded in the native binary or bundled into the
default catalog, it would arguably put the whole distributed work under GPL
terms, which contradicts the MIT engine this project promises. So from v2.2:

- The default catalog (`@url-sanitize/merged`, the npm CLI, the native binary)
  is ClearURLs, Brave and Firefox only.
- `@url-sanitize/adguard` still ships, labelled `MIT AND GPL-3.0-only`. Pass
  `adguardCatalog` to `mergeSources()` to use it, and check that GPL-3.0 fits
  your project first.

If AdGuard confirms the filter can be used under a weaker license, it can
return to the default.

## What this means for consumers

### "I want to use this in a closed-source / commercial SaaS"

- Use `@url-sanitize/core` directly — MIT, no copyleft.
- Use `@url-sanitize/clearurls`, `@url-sanitize/brave`, `@url-sanitize/firefox`, or `@url-sanitize/merged` only if their data licenses are acceptable. LGPL/MPL on data files is generally fine for non-derivative use, but consult your legal team if unsure.
- Avoid `@url-sanitize/adguard` unless GPL-3.0 is acceptable for what you ship. It is not part of any default.
- Or: write your own catalog (plain TypeScript literal of `SanitizerCatalog`) and skip bundled source packages entirely. No upstream data-license surface.

### "I'm building an open-source project"

- Use whatever license you want. Both MIT and LGPL are compatible with most OSS licenses (GPL-2.0, GPL-3.0, MIT, Apache-2.0, BSD).

### "I'm worried about AGPL"

- `url-sanitize` is **not** AGPL. The competing `@quik-fe/clear-urls` package is AGPL-3.0-only, which triggers network-use copyleft (running it on a server = obligation to open-source your server). We deliberately avoid AGPL to unlock SaaS adoption.

## Why the bundled data is LGPL, not MIT

The ClearURLs Rules repository (https://github.com/ClearURLs/Rules) is licensed LGPL-3.0-only. We reproduce their data under the same license to respect upstream's terms. Re-licensing it MIT would be license laundering and we won't do it.

Algorithm code is a different story: the ClearURLs algorithm is a public specification (see https://docs.clearurls.xyz/). Writing a fresh TypeScript implementation against the spec is clean-room reverse engineering — we owe no license obligation to the original Addon's LGPL code because we never read it. That's why `@url-sanitize/core` is MIT.

## Trademark note

"ClearURLs" is a trademark of its respective authors. This project is **not** an official ClearURLs project, **not** endorsed by the ClearURLs maintainers, and uses the name "ClearURLs" only in a descriptive capacity ("ClearURLs-compatible rules", "rules derived from ClearURLs"). See `packages/clearurls/NOTICE`.
