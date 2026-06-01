# @url-sanitize/fetch

Runtime ClearURLs catalog fetching with SHA256 verification and optional
consumer-side hash pinning.

## Install

```sh
npm install @url-sanitize/fetch @url-sanitize/core
```

## Usage

```ts
import { fetchClearurlsCatalog } from '@url-sanitize/fetch';
import { compileSanitizer } from '@url-sanitize/core';

const { catalog, metadata } = await fetchClearurlsCatalog({
  pinnedHash: process.env.CLEARURLS_RULES_HASH
});

const sanitize = compileSanitizer(catalog);
console.log(metadata.hash);
console.log(sanitize('https://example.com/?utm_source=x'));
```

`pinnedHash` is optional. When set, the downloaded rules must match both the
upstream `rules.minify.hash` and the consumer-provided pin. `timeoutMs` defaults
to `10000` and bounds each rules/hash request.

## License

MIT.
