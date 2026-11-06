//! Hostile-catalog and hostile-input cases shared with the TS engine
//! (`packages/core/test/hardening.test.ts` reads the same fixture).

use serde::Deserialize;
use url_sanitize_core::{Catalog, SanitizeResult, SanitizerOptions};

#[derive(Deserialize)]
struct Fixture {
    catalog: serde_json::Value,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    id: String,
    input: String,
    #[serde(default)]
    options: Options,
    expected: Expected,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Options {
    #[serde(default)]
    domain_blocking: bool,
}

#[derive(Deserialize)]
struct Expected {
    kind: String,
    url: Option<String>,
}

fn expand(s: &str) -> String {
    if s == "LONG" {
        format!("https://a.example/?utm_source=x&q={}", "a".repeat(8200))
    } else {
        s.to_string()
    }
}

#[test]
fn hardening_fixture_matches_rust_engine() {
    let text = include_str!("fixtures/hardening.json");
    let fixture: Fixture = serde_json::from_str(text).expect("fixture parses");
    let catalog = Catalog::from_json(&fixture.catalog.to_string()).expect("catalog parses");
    let mut failures = Vec::new();
    for case in &fixture.cases {
        let options = SanitizerOptions {
            domain_blocking: case.options.domain_blocking,
            ..SanitizerOptions::default()
        };
        let result = catalog.compile(options).sanitize(&expand(&case.input));
        let (kind, url) = match &result {
            SanitizeResult::Unchanged { url } => ("unchanged", Some(url.clone())),
            SanitizeResult::Cleaned { url, .. } => ("cleaned", Some(url.clone())),
            SanitizeResult::Redirected { url, .. } => ("redirected", Some(url.clone())),
            SanitizeResult::Blocked { .. } => ("blocked", None),
        };
        let want_url = case.expected.url.as_deref().map(expand);
        if kind != case.expected.kind || (want_url.is_some() && url != want_url) {
            failures.push(format!(
                "{}: got {kind} {:?}, want {} {:?}",
                case.id,
                url.map(|u| u.chars().take(80).collect::<String>()),
                case.expected.kind,
                want_url.map(|u| u.chars().take(80).collect::<String>())
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
