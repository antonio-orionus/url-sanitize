use serde::Deserialize;

use crate::compile::Sanitizer;
use crate::types::{RuleSource, SanitizerOptions, SanitizerRule};

#[derive(Debug, Deserialize)]
pub struct Catalog {
    pub version: String,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub sources: Vec<CatalogSource>,
    pub rules: Vec<SanitizerRule>,
}

#[derive(Debug, Deserialize)]
pub struct CatalogSource {
    pub name: RuleSource,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub upstream: Option<String>,
}

#[derive(Debug)]
pub struct CatalogParseError(pub serde_json::Error);

impl std::fmt::Display for CatalogParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "catalog parse error: {}", self.0)
    }
}

impl std::error::Error for CatalogParseError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.0)
    }
}

impl Catalog {
    pub fn from_json(s: &str) -> Result<Self, CatalogParseError> {
        serde_json::from_str(s).map_err(CatalogParseError)
    }

    pub fn compile(&self, options: SanitizerOptions) -> Sanitizer {
        Sanitizer::compile(&self.rules, options)
    }

    pub fn catalog_hash(&self) -> Option<&str> {
        self.sources.first().and_then(|s| s.hash.as_deref())
    }
}
