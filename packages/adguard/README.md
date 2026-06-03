# @url-sanitize/adguard

AdGuard URL Tracking Protection catalog and adapter for
[`@url-sanitize/core`](../core).

Ships a pinned snapshot of:

```text
https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_17_TrackParam/filter.txt
```

## Install

```sh
npm install @url-sanitize/core @url-sanitize/adguard
```

## Usage

```ts
import { compileSanitizer } from '@url-sanitize/core';
import { adguardCatalog } from '@url-sanitize/adguard';

const sanitize = compileSanitizer(adguardCatalog);
sanitize('https://example.com/?srsltid=x&id=123');
```

## Raw access

```ts
import { adguardRawData, adguardMetadata } from '@url-sanitize/adguard/raw';
import { adguardToCatalog } from '@url-sanitize/adguard/adapter';
```

## License

Adapter code is project code. Bundled AdGuard filter data is **LGPL-3.0-only**.
See [NOTICE](NOTICE).
