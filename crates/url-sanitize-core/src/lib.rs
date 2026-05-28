//! url-sanitize-core — pure-Rust implementation of the url-sanitize spec.
//!
//! See `docs/spec.md` in the workspace root for the normative algorithm. The
//! Rust types here mirror the TypeScript discriminated union 1:1 and serialize
//! to identical JSON.

mod catalog;
mod compile;
mod sanitize;
mod types;

pub use catalog::{Catalog, CatalogParseError};
pub use compile::{CompileError, Sanitizer};
pub use types::{MatchedRule, RuleSource, SanitizeResult, SanitizerOptions, SanitizerRule};
