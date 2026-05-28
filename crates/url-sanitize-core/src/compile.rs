use regex_lite::Regex;

use crate::sanitize::sanitize_with;
use crate::types::{RuleKind, RuleSource, SanitizeResult, SanitizerOptions, SanitizerRule};

#[derive(Debug)]
pub struct CompileError(pub String);

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CompileError {}

pub(crate) struct CompiledRule {
    pub source: RuleSource,
    pub provider: String,
    pub kind: RuleKind,
    pub url_pattern: Option<Regex>,
    pub exceptions: Vec<Regex>,
    pub body: CompiledBody,
}

pub(crate) enum CompiledBody {
    StripParam {
        param_pattern: Regex,
        is_referral_marketing: bool,
    },
    RawReplace {
        pattern: Regex,
        replacement: String,
    },
    UnwrapRedirect {
        pattern: Regex,
        capture_group: usize,
    },
    BlockDomain,
}

pub struct Sanitizer {
    pub(crate) rules: Vec<CompiledRule>,
    pub(crate) options: SanitizerOptions,
}

fn compile_one(r: &SanitizerRule) -> Option<CompiledRule> {
    fn try_re(pat: &str) -> Option<Regex> {
        Regex::new(pat).ok()
    }
    fn try_re_ci(pat: &str) -> Option<Regex> {
        Regex::new(&format!("(?i){}", pat)).ok()
    }
    fn compile_exceptions(list: &[String]) -> Vec<Regex> {
        list.iter().filter_map(|p| try_re(p)).collect()
    }

    match r {
        SanitizerRule::StripParam {
            source,
            provider,
            url_pattern,
            param_pattern,
            exceptions,
            is_referral_marketing,
        } => {
            let pp = try_re_ci(&format!("^(?:{})$", param_pattern))?;
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(try_re_ci(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::StripParam,
                url_pattern: urlp,
                exceptions: compile_exceptions(exceptions),
                body: CompiledBody::StripParam {
                    param_pattern: pp,
                    is_referral_marketing: *is_referral_marketing,
                },
            })
        }
        SanitizerRule::RawReplace {
            source,
            provider,
            url_pattern,
            pattern,
            replacement,
            exceptions,
        } => {
            let p = try_re_ci(pattern)?;
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(try_re_ci(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::RawReplace,
                url_pattern: urlp,
                exceptions: compile_exceptions(exceptions),
                body: CompiledBody::RawReplace {
                    pattern: p,
                    replacement: replacement.clone(),
                },
            })
        }
        SanitizerRule::UnwrapRedirect {
            source,
            provider,
            url_pattern,
            pattern,
            capture_group,
            exceptions,
        } => {
            let p = try_re_ci(pattern)?;
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(try_re_ci(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::UnwrapRedirect,
                url_pattern: urlp,
                exceptions: compile_exceptions(exceptions),
                body: CompiledBody::UnwrapRedirect {
                    pattern: p,
                    capture_group: *capture_group as usize,
                },
            })
        }
        SanitizerRule::BlockDomain {
            source,
            provider,
            url_pattern,
            exceptions,
        } => {
            let urlp = try_re_ci(url_pattern)?;
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::BlockDomain,
                url_pattern: Some(urlp),
                exceptions: compile_exceptions(exceptions),
                body: CompiledBody::BlockDomain,
            })
        }
    }
}

impl Sanitizer {
    pub fn compile(rules: &[SanitizerRule], options: SanitizerOptions) -> Sanitizer {
        let compiled: Vec<CompiledRule> = rules.iter().filter_map(compile_one).collect();
        Sanitizer {
            rules: compiled,
            options,
        }
    }

    pub fn sanitize(&self, input: &str) -> SanitizeResult {
        sanitize_with(&self.rules, &self.options, input)
    }
}
