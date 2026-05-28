# url-sanitize-core

Pure-Rust implementation of the [url-sanitize behavioral spec](https://github.com/antonio-orionus/url-sanitize/blob/main/docs/spec.md).

Engine only — no embedded catalog. For a ready-to-use binary with the
ClearURLs ruleset baked in, see the [`url-sanitize`](https://crates.io/crates/url-sanitize) crate.

```rust
use url_sanitize_core::{Catalog, SanitizerOptions};

let json = std::fs::read_to_string("catalog/clearurls.json")?;
let catalog = Catalog::from_json(&json)?;
let sanitizer = catalog.compile(SanitizerOptions::default());
let result = sanitizer.sanitize("https://example.com/?utm_source=x");
println!("{}", serde_json::to_string(&result)?);
```

Conformance with the TypeScript engine is verified by the shared corpus in
[`conformance/`](https://github.com/antonio-orionus/url-sanitize/tree/main/conformance).
