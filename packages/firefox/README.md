# @url-sanitize/firefox

Firefox Query Stripping catalog and adapter for [`@url-sanitize/core`](../core).

Ships a pinned snapshot of Mozilla Remote Settings query-stripping records:

```text
https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/query-stripping/records
```

## Install

```sh
npm install @url-sanitize/core @url-sanitize/firefox
```

## Usage

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { firefoxCatalog } from '@url-sanitize/firefox';

const sanitize = compileSanitizer(firefoxCatalog);
sanitize('https://example.com/?wbraid=x&id=123');
```

## Raw access

```ts
import { firefoxRawData, firefoxMetadata } from '@url-sanitize/firefox/raw';
import { firefoxToCatalog } from '@url-sanitize/firefox/adapter';
```

## License

Adapter code is project code. Bundled Firefox Query Stripping data is
**MPL-2.0**. See [NOTICE](NOTICE).
