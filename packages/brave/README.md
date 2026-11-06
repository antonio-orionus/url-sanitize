# @url-sanitize/brave

Brave catalog and adapter for [`@url-sanitize/core`](../core), from three
lists in `brave/adblock-lists`:

- `debounce.json`: the Debouncer, which unwraps tracking redirects.
- `query-filter.json`: the tracking params Brave strips on navigation, on every
  site (`fbclid`, `gclid`, `_hsenc`, …) and on a few (Instagram, X, YouTube).
- `clean-urls.json`: per-site params behind Brave's "Copy clean link".

Ships a pinned snapshot of:

```text
https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/debounce.json
https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/query-filter.json
https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/clean-urls.json
```

Params this project treats as referral marketing (`BRAVE_REFERRAL_MARKETING_PARAMS`:
Amazon's affiliate `tag` and `ascsubtag`, `ref`, `ref_`, `referrer`, `partner`)
become separate rules flagged `isReferralMarketing`, so they are kept unless
`stripReferralMarketing` is on, as with ClearURLs.

## Install

```sh
npm install @url-sanitize/core @url-sanitize/brave
```

## Usage

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { braveCatalog } from '@url-sanitize/brave';

const sanitize = compileSanitizer(braveCatalog);
sanitize('https://y2u.be/dQw4w9WgXcQ');
```

## Raw access

```ts
import { braveRawData, braveMetadata } from '@url-sanitize/brave/raw';
import { braveToCatalog } from '@url-sanitize/brave/adapter';
```

## License

Adapter code is MIT. Bundled Brave list data is **MPL-2.0**.
See [NOTICE](NOTICE).
