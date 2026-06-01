# Non-goals

What `url-sanitize` will never do. Stops scope-creep PRs cold.

## Will never be a browser extension

Use ClearURLs Addon (https://clearurls.xyz/) for browser-level interception. `url-sanitize` is a developer library + CLI + GH Action.

## Will never intercept HTTP requests

We don't proxy, we don't MITM, we don't hook `fetch()`. We accept URL strings, return cleaned URL strings (plus result metadata). Composition with networking is the consumer's job.

HTTP middleware wrappers can live as future examples or third-party packages. They are demos, not core functionality.

## Will never do DNS-level blocking

Use Pi-hole, AdGuard Home, NextDNS, or a real DNS-blocking solution. We don't resolve hostnames and we don't drop traffic.

## Will never include telemetry

No analytics, no usage reporting, no "phone home". This is a sanitization library, not a data-collection vector. Telemetry would directly contradict the privacy posture of the user-base.

## Will never bundle network code in `@url-sanitize/core`

`@url-sanitize/core` is a pure function: catalog + URL → result. Zero I/O. Zero dependencies. Runs in any JavaScript environment that has `URL` and `RegExp` (which is all of them).

If you need network fetching, use the planned `@url-sanitize/fetch` package once it ships in v0.4. Keeping `core` I/O-free preserves:

- SSR safety
- Edge / worker runtime support (no `node:*` imports)
- Auditability (no surprise outbound connections)
- Bundle size (consumers who don't need fetch don't pay for it)

## Will never enforce a single rule source

We bundle ClearURLs because it's the most comprehensive public ruleset. We never make `core` ClearURLs-specific. v2.0 will add AdGuard, Brave, Firefox sources as separate packages. Consumers compose what they need.

## Will never gate features behind a paid tier

OSS, MIT (mostly), no commercial tier, no enterprise edition. If sponsors appear, they get acknowledgment in README — they don't get to shape the codebase into a freemium funnel.

## Will never silently change rule behavior

Every rule change ships via daily sync workflow → opens a version-bump PR → publishes through the same auto-tagged release pipeline as normal releases. Consumers who pin versions are never surprised by rule changes. Once `@url-sanitize/fetch` exists, consumers who hot-refresh through it will be doing so explicitly.

## Will never depend on a yanked / abandoned upstream

If ClearURLs upstream goes silent for >6 months, we fork the ruleset into our own repository and continue maintenance. The community continuity is more important than upstream attribution. This is a soft commitment, not a contractual one.
