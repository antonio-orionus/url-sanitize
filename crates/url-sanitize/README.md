# url-sanitize

Sub-1MB native CLI to remove tracking parameters and unwrap tracking redirects
from URLs. Agent-friendly: deterministic, structured (`--json`), no prompts,
pinned ruleset baked in.

```
url-sanitize 'https://example.com/?utm_source=x'
# https://example.com/

echo 'https://www.amazon.com/dp/B0/ref=foo' | url-sanitize -
# https://www.amazon.com/dp/B0

url-sanitize --json 'https://www.google.com/url?q=https%3A%2F%2Fexample.org'
# {"kind":"redirected","original":"...","url":"https://example.org/","via":{"source":"clearurls","provider":"google","kind":"unwrap-redirect"}}
```

See [the spec](https://github.com/antonio-orionus/url-sanitize/blob/main/docs/spec.md)
for the full CLI contract, exit codes, and output schema.

Built on [`url-sanitize-core`](https://crates.io/crates/url-sanitize-core) and
the [ClearURLs](https://docs.clearurls.xyz/) ruleset (LGPL-3.0; see NOTICE).
