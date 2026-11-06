# @url-sanitize/merged

Default merged catalog for [`@url-sanitize/core`](../core).

Combines sources in deterministic priority order:

```text
clearurls → brave → firefox
```

AdGuard is not a default source: its filter data is GPL-3.0, and this catalog
ships inside the MIT CLI and native binary. See [Adding AdGuard](#adding-adguard).

Exact semantic duplicate rules are deduped; distinct scoped rules are preserved.

## Install

```sh
npm install @url-sanitize/core @url-sanitize/merged
```

## Usage

```ts
import { sanitize, mergedCatalog, mergedMetadata } from '@url-sanitize/merged';
import { compileSanitizer } from '@url-sanitize/core';

sanitize('https://example.com/?utm_source=x');

const aggressive = compileSanitizer(mergedCatalog, {
  stripReferralMarketing: true,
  domainBlocking: true
});

console.log(mergedMetadata.sources);
console.log(aggressive('https://y2u.be/dQw4w9WgXcQ'));
```

## Custom merge

```ts
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { firefoxCatalog } from '@url-sanitize/firefox';
import { mergeSources } from '@url-sanitize/merged';

const catalog = mergeSources([clearurlsCatalog, firefoxCatalog]);
```

## Adding AdGuard

`@url-sanitize/adguard` adds about 2,700 AdGuard URL Tracking rules, including
`keep-param` allowlists. Its data is **GPL-3.0-only**, so check that license
fits your project before you ship it.

```sh
npm install @url-sanitize/adguard
```

```ts
import { adguardCatalog } from '@url-sanitize/adguard';
import { braveCatalog } from '@url-sanitize/brave';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { compileSanitizer } from '@url-sanitize/core';
import { firefoxCatalog } from '@url-sanitize/firefox';
import { mergeSources } from '@url-sanitize/merged';

const sanitize = compileSanitizer(
  mergeSources([clearurlsCatalog, adguardCatalog, braveCatalog, firefoxCatalog])
);
```

## License

Merge code is MIT. This package copies no rule data; each source package keeps
its own license: ClearURLs data is LGPL-3.0-only, Brave and Firefox data are
MPL-2.0, and the opt-in AdGuard data is GPL-3.0-only. See [NOTICE](NOTICE).
