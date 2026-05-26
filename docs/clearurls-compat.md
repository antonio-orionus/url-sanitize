# ClearURLs compatibility guide

If you're coming from the ClearURLs Addon, `@quik-fe/clear-urls`, or hand-rolled regex code, this guide gets you to `url-sanitize` quickly.

## From `@quik-fe/clear-urls`

```ts
// before
import { clearUrl } from '@quik-fe/clear-urls';
const result: string = clearUrl(input);

// after
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
const sanitize = compileSanitizer(clearurlsCatalog);
const result = sanitize(input);
// result is a discriminated union — see below
```

Key differences:

- We return a discriminated union (`unchanged` / `cleaned` / `redirected` / `blocked`) instead of a bare string. If you want a string, use `result.url ?? result.original` or branch on `result.kind`.
- We're MIT-licensed (engine) + LGPL-3.0-only (bundled rules) instead of AGPL-3.0-only on the whole package. Safer for SaaS / commercial.
- We sync rules daily from upstream ClearURLs. `@quik-fe/clear-urls` is a static fork.

## From hand-rolled regex code

If your project ships hand-maintained tracking-param strip regexes (looking at you, `?utm_*`, `?fbclid`, etc.), `url-sanitize` does the entire ClearURLs ruleset for you. ~200 providers covered out of the box.

```ts
// before (excerpt)
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|mc_eid|...)/;
function clean(url: string): string { /* ... */ }

// after
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
const sanitize = compileSanitizer(clearurlsCatalog);
const result = sanitize(url);
const cleaned = result.kind === 'unchanged' ? result.url : result.url;
```

## From ClearURLs Addon

Different audience. The Addon is a browser extension for end-users. `url-sanitize` is a developer library. They're orthogonal:

- Use the Addon if you're an end-user who wants their browser to clean URLs.
- Use `url-sanitize` if you're building a server, CLI, Electron app, paste handler, link previewer, or anything else that processes URLs in code.

## Rule-set parity

We aim for 100% parity with the ClearURLs Rules JSON schema:

| Field | Status |
| --- | --- |
| `urlPattern` | ✅ provider gate |
| `rules` | ✅ strip query / fragment params |
| `rawRules` | ✅ regex replace on full URL |
| `redirections` | ✅ unwrap first capture group |
| `referralMarketing` | ✅ opt-in via `stripReferralMarketing` |
| `exceptions` | ✅ skip provider for matching URLs |
| `completeProvider` | ✅ opt-in via `domainBlocking` |
| `forceRedirection` | ⛔ browser-extension semantics, doesn't apply |

If you spot a behavioral divergence from the ClearURLs Addon, file an issue with a fixture.
