use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleSource {
    Clearurls,
    Adguard,
    Brave,
    Firefox,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuleKind {
    StripParam,
    RawReplace,
    UnwrapRedirect,
    BlockDomain,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SanitizerRule {
    StripParam {
        source: RuleSource,
        provider: String,
        #[serde(default, rename = "urlPattern")]
        url_pattern: Option<String>,
        #[serde(rename = "paramPattern")]
        param_pattern: String,
        #[serde(default)]
        exceptions: Vec<String>,
        #[serde(default, rename = "isReferralMarketing")]
        is_referral_marketing: bool,
    },
    RawReplace {
        source: RuleSource,
        provider: String,
        #[serde(default, rename = "urlPattern")]
        url_pattern: Option<String>,
        pattern: String,
        replacement: String,
        #[serde(default)]
        exceptions: Vec<String>,
    },
    UnwrapRedirect {
        source: RuleSource,
        provider: String,
        #[serde(default, rename = "urlPattern")]
        url_pattern: Option<String>,
        pattern: String,
        #[serde(rename = "captureGroup")]
        capture_group: u32,
        #[serde(default)]
        exceptions: Vec<String>,
    },
    BlockDomain {
        source: RuleSource,
        provider: String,
        #[serde(rename = "urlPattern")]
        url_pattern: String,
        #[serde(default)]
        exceptions: Vec<String>,
    },
}

#[derive(Debug, Clone, Default, Copy, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SanitizerOptions {
    pub strip_referral_marketing: bool,
    pub unwrap_redirects: Option<bool>,
    pub domain_blocking: bool,
}

impl SanitizerOptions {
    pub fn unwrap_redirects(&self) -> bool {
        self.unwrap_redirects.unwrap_or(true)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MatchedRule {
    pub source: RuleSource,
    pub provider: String,
    pub kind: RuleKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SanitizeResult {
    Unchanged {
        url: String,
    },
    #[serde(rename_all = "camelCase")]
    Cleaned {
        original: String,
        url: String,
        stripped_params: Vec<String>,
        matched_rules: Vec<MatchedRule>,
    },
    Redirected {
        original: String,
        url: String,
        via: MatchedRule,
    },
    Blocked {
        original: String,
        via: MatchedRule,
    },
}
