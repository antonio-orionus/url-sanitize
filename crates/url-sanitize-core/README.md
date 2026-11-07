# url-sanitize-core

Pure-Rust implementation for removing tracking parameters and unwrapping
tracking redirects according to the
[url-sanitize behavioral spec](https://github.com/antonio-orionus/url-sanitize/blob/main/docs/spec.md).

Engine only — no embedded catalog. For a ready-to-use binary with the merged
ClearURLs, Brave, and Firefox catalog baked in, see the
[`url-sanitize`](https://crates.io/crates/url-sanitize) crate.

```rust
use url_sanitize_core::{Catalog, SanitizerOptions};

let json = std::fs::read_to_string("catalog/catalog.json")?;
let catalog = Catalog::from_json(&json)?;
let sanitizer = catalog.compile(SanitizerOptions::default());
let result = sanitizer.sanitize("https://example.com/?utm_source=x");
println!("{}", serde_json::to_string(&result)?);

// Every URL inside text, the rest kept as is.
let text = sanitizer.sanitize_text("see https://example.com/?utm_source=x.");
assert_eq!(text.text, "see https://example.com/.");
```

Conformance with the TypeScript engine is verified by the shared corpus in
[`conformance/`](https://github.com/antonio-orionus/url-sanitize/tree/main/conformance).
