# @url-sanitize/core

Pure TypeScript implementation for removing tracking parameters and unwrapping tracking redirects with explainable results and pluggable catalogs.

## Install

```sh
npm install @url-sanitize/core @url-sanitize/clearurls
```

## Usage

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';

const sanitize = compileSanitizer(clearurlsCatalog, {
  stripReferralMarketing: false,
  unwrapRedirects: true,
  domainBlocking: false
});

const result = sanitize('https://example.com/?utm_source=x&id=123');
```

## Result shape

```ts
type SanitizeResult =
  | { kind: 'unchanged'; url: string }
  | { kind: 'cleaned'; original: string; url: string;
      strippedParams: string[]; matchedRules: MatchedRule[] }
  | { kind: 'redirected'; original: string; url: string; via: MatchedRule }
  | { kind: 'blocked'; original: string; via: MatchedRule };
```

## Design

- Zero runtime dependencies.
- Pure function; no I/O.
- Catalog-agnostic: any source (ClearURLs, AdGuard, custom) that produces a `SanitizerCatalog` works.
- Factory pattern (`compileSanitizer(catalog)`) — no module-level cache, no singletons.
- Discriminated union return type — exhaustive `switch (result.kind)`.

## Custom catalogs

```ts
import { defineCatalog, mergeCatalogs, sanitizerCatalogJsonSchema } from '@url-sanitize/core';

const custom = defineCatalog({
  version: 'custom-1',
  generatedAt: new Date().toISOString(),
  sources: [{ name: 'custom' }],
  rules: [{ kind: 'strip-param', source: 'custom', provider: 'local', paramPattern: 'utm_.+' }]
});

const merged = mergeCatalogs(custom);
console.log(sanitizerCatalogJsonSchema.$id);
```

`mergeCatalogs()` preserves input order and concatenates sources/rules. It does
not dedupe, reorder, or apply source precedence.

## License

MIT.
