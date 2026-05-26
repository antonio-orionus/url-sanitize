# @url-sanitize/clearurls

ClearURLs-compatible rule catalog and adapter for [`@url-sanitize/core`](../core).

Ships a snapshot of the ClearURLs ruleset, daily-synced from upstream
`https://rules2.clearurls.xyz/data.minify.json` with SHA256 verification.

## Install

```sh
npm install @url-sanitize/core @url-sanitize/clearurls
```

## Usage

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';

const sanitize = compileSanitizer(clearurlsCatalog);
sanitize('https://example.com/?utm_source=x');
```

## Raw access

If you need the unprocessed ClearURLs JSON shape (for custom adapters or
tooling), use the secondary entrypoint:

```ts
import { clearurlsRawData, clearurlsMetadata } from '@url-sanitize/clearurls/raw';
```

## License

- `src/` (adapter, types) — **MIT**
- `data/data.json` (bundled ClearURLs ruleset) — **LGPL-3.0-only**

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
