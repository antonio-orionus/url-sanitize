# @url-sanitize/fetch

Runtime ClearURLs catalog fetching with SHA256 verification and optional
consumer-side hash pinning.

This package intentionally fetches only ClearURLs at runtime. For the bundled
default multi-source behavior, use `@url-sanitize/merged`.

## Install

```sh
npm install @url-sanitize/fetch @url-sanitize/core
```

## Usage

```ts
import { fetchClearurlsCatalog } from '@url-sanitize/fetch';
import { compileSanitizer } from '@url-sanitize/core';

const { catalog, metadata } = await fetchClearurlsCatalog({
  // Throws if the variable is unset: a present-but-empty pin is an error.
  pinnedHash: process.env.CLEARURLS_RULES_HASH
});

const sanitize = compileSanitizer(catalog);
console.log(metadata.hash);
console.log(sanitize('https://example.com/?utm_source=x'));
```

The downloaded rules must always match the upstream `rules.minify.hash`. That
file comes from the same origin, so it proves consistency, not authenticity;
see [the threat model](../../docs/threat-model.md).

| Option | Default | |
| --- | --- | --- |
| `pinnedHash` | none | SHA256 the rules must also match. Leave the key out for no pin; a key set to `undefined` or `''` throws before any request. |
| `rulesUrl`, `hashUrl` | ClearURLs' | Must be `https:`. A redirect to `http:` is rejected. |
| `timeoutMs` | `10000` | Bounds each request, including reading its body. |
| `maxBytes` | 16 MiB | Largest body accepted per request. |

Every provider is checked before it becomes rules: `urlPattern` must be a
non-empty string, flags booleans and rule fields lists of strings.

**Without a pin, a fetched catalog is only as trustworthy as the origin
serving it.** Its rules are regexes run against every URL. `@url-sanitize/core`
caps URL length and defuses the common slow patterns, but a hostile catalog
can still ship a regex that backtracks exponentially. Pin the hash wherever
the origin isn't yours to trust.

## License

MIT.
