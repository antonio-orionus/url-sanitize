# @url-sanitize/brave

Brave Debouncer catalog and adapter for [`@url-sanitize/core`](../core).

Ships a pinned snapshot of:

```text
https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/debounce.json
```

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

Adapter code is project code. Bundled Brave Debouncer data is **MPL-2.0**.
See [NOTICE](NOTICE).
