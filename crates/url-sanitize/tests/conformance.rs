//! Rust-engine conformance gate.
//!
//! Loads `conformance/vectors.jsonl` + `conformance/clearurls-corpus.jsonl`
//! and asserts the Rust engine reproduces every `expected` field. Identical
//! contract to the TS-side `conformance/conformance.test.ts`.

use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

use url_sanitize_core::{Catalog, SanitizeResult, SanitizerOptions};

const CATALOG_JSON: &str = include_str!("../../../catalog/catalog.json");
/// The default plus the opt-in AdGuard source, for vectors with
/// `"catalog": "all-sources"`. See `conformance/catalogs.ts`.
const ALL_SOURCES_JSON: &str = include_str!("../../../catalog/all-sources.json");

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Expected {
    Unchanged {
        url: String,
    },
    #[serde(rename_all = "camelCase")]
    Cleaned {
        url: String,
        #[serde(default)]
        stripped_params_contains: Vec<String>,
        #[serde(default)]
        matched_providers: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Redirected {
        url: String,
        via_provider: String,
    },
    #[serde(rename_all = "camelCase")]
    Blocked {
        via_provider: String,
    },
}

#[derive(Debug, Deserialize)]
struct Vector {
    id: String,
    input: String,
    #[serde(default)]
    catalog: Option<String>,
    #[serde(default)]
    options: Option<SanitizerOptions>,
    expected: Expected,
}

fn workspace_root() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest.parent().unwrap().parent().unwrap().to_path_buf()
}

fn load_jsonl(rel: &str) -> Vec<Vector> {
    let path = workspace_root().join(rel);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {}", rel, e));
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .enumerate()
        .map(|(i, line)| {
            serde_json::from_str(line).unwrap_or_else(|e| panic!("{}:{}: {}", rel, i + 1, e))
        })
        .collect()
}

fn catalog() -> Catalog {
    Catalog::from_json(CATALOG_JSON).expect("parse embedded catalog")
}

fn all_sources_catalog() -> Catalog {
    Catalog::from_json(ALL_SOURCES_JSON).expect("parse all-sources catalog")
}

fn check_vector(cat: &Catalog, v: &Vector) -> Result<(), String> {
    let sanitizer = cat.compile(v.options.unwrap_or_default());
    let actual = sanitizer.sanitize(&v.input);
    match (&actual, &v.expected) {
        (SanitizeResult::Unchanged { url }, Expected::Unchanged { url: eurl }) => {
            if url != eurl {
                return Err(format!(
                    "{}: unchanged url mismatch\n  got: {:?}\n  exp: {:?}",
                    v.id, url, eurl
                ));
            }
        }
        (
            SanitizeResult::Cleaned {
                url,
                stripped_params,
                matched_rules,
                ..
            },
            Expected::Cleaned {
                url: eurl,
                stripped_params_contains,
                matched_providers,
            },
        ) => {
            if url != eurl {
                return Err(format!(
                    "{}: cleaned url mismatch\n  got: {:?}\n  exp: {:?}",
                    v.id, url, eurl
                ));
            }
            for name in stripped_params_contains {
                if !stripped_params.iter().any(|s| s == name) {
                    return Err(format!(
                        "{}: stripped_params missing {:?}\n  got: {:?}",
                        v.id, name, stripped_params
                    ));
                }
            }
            for p in matched_providers {
                if !matched_rules.iter().any(|m| &m.provider == p) {
                    return Err(format!(
                        "{}: matched_providers missing {:?}\n  got: {:?}",
                        v.id,
                        p,
                        matched_rules
                            .iter()
                            .map(|m| &m.provider)
                            .collect::<Vec<_>>()
                    ));
                }
            }
        }
        (
            SanitizeResult::Redirected { url, via, .. },
            Expected::Redirected {
                url: eurl,
                via_provider,
            },
        ) => {
            if url != eurl {
                return Err(format!(
                    "{}: redirected url mismatch\n  got: {:?}\n  exp: {:?}",
                    v.id, url, eurl
                ));
            }
            if &via.provider != via_provider {
                return Err(format!(
                    "{}: via.provider mismatch\n  got: {:?}\n  exp: {:?}",
                    v.id, via.provider, via_provider
                ));
            }
        }
        (SanitizeResult::Blocked { via, .. }, Expected::Blocked { via_provider }) => {
            if &via.provider != via_provider {
                return Err(format!("{}: via.provider mismatch", v.id));
            }
        }
        (actual, expected) => {
            return Err(format!(
                "{}: kind mismatch\n  got: {:?}\n  exp: {:?}",
                v.id, actual, expected
            ));
        }
    }
    Ok(())
}

#[test]
fn vectors_jsonl_matches_rust_engine() {
    let cat = catalog();
    let all_sources = all_sources_catalog();
    let vectors = load_jsonl("conformance/vectors.jsonl");
    let mut failures = Vec::new();
    for v in &vectors {
        let cat = match v.catalog.as_deref() {
            None | Some("default") => &cat,
            Some("all-sources") => &all_sources,
            Some(other) => panic!("{}: unknown catalog {:?}", v.id, other),
        };
        if let Err(e) = check_vector(cat, v) {
            failures.push(e);
        }
    }
    if !failures.is_empty() {
        panic!(
            "{} vector failures:\n{}",
            failures.len(),
            failures.join("\n\n")
        );
    }
}

#[test]
fn clearurls_corpus_jsonl_matches_rust_engine() {
    let cat = catalog();
    let vectors = load_jsonl("conformance/clearurls-corpus.jsonl");
    let mut failures = Vec::new();
    for v in &vectors {
        if let Err(e) = check_vector(&cat, v) {
            failures.push(e);
        }
    }
    if !failures.is_empty() {
        panic!(
            "{} corpus failures:\n{}",
            failures.len(),
            failures.join("\n\n")
        );
    }
}

/// A hand-written `text-vectors.jsonl` entry: the URLs found in `input`, and
/// the text after cleaning. Same contract as the TS-side test.
#[derive(Debug, Deserialize)]
struct TextVector {
    id: String,
    input: String,
    #[serde(default)]
    options: Option<SanitizerOptions>,
    expected: TextExpected,
}

#[derive(Debug, Deserialize)]
struct TextExpected {
    text: String,
    found: Vec<String>,
}

#[test]
fn text_vectors_jsonl_matches_rust_engine() {
    let cat = catalog();
    let path = workspace_root().join("conformance/text-vectors.jsonl");
    let text = fs::read_to_string(&path).expect("read text-vectors.jsonl");
    let mut failures = Vec::new();
    for (i, line) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
        let v: TextVector = serde_json::from_str(line)
            .unwrap_or_else(|e| panic!("text-vectors.jsonl:{}: {}", i + 1, e));
        let sanitizer = cat.compile(v.options.unwrap_or_default());
        let result = sanitizer.sanitize_text(&v.input);
        let found: Vec<&str> = result
            .urls
            .iter()
            .map(|r| match r {
                SanitizeResult::Unchanged { url } => url.as_str(),
                SanitizeResult::Cleaned { original, .. }
                | SanitizeResult::Redirected { original, .. }
                | SanitizeResult::Blocked { original, .. } => original.as_str(),
            })
            .collect();
        if result.text != v.expected.text {
            failures.push(format!(
                "{}: text\n  got: {:?}\n  exp: {:?}",
                v.id, result.text, v.expected.text
            ));
        }
        if found != v.expected.found {
            failures.push(format!(
                "{}: found\n  got: {:?}\n  exp: {:?}",
                v.id, found, v.expected.found
            ));
        }
        if sanitizer.sanitize_text(&result.text).text != result.text {
            failures.push(format!("{}: not idempotent", v.id));
        }
    }
    if !failures.is_empty() {
        panic!(
            "{} text vector failures:\n{}",
            failures.len(),
            failures.join("\n\n")
        );
    }
}
