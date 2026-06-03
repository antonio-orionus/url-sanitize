# @url-sanitize/merged

Default merged catalog for [`@url-sanitize/core`](../core).

Combines sources in deterministic priority order:

```text
clearurls → adguard → brave → firefox
```

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

## License

Merge adapter code is MIT. Bundled upstream data keeps its source license:
ClearURLs and AdGuard are LGPL-3.0-only; Brave and Firefox data are MPL-2.0.
See [NOTICE](NOTICE).
