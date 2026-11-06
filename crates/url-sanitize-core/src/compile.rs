use std::collections::HashMap;

use regex_lite::Regex;

use crate::literal::required_literals;
use crate::sanitize::sanitize_with;
use crate::types::{
    RedirectMatchPart, RedirectPrependScheme, RedirectTargetEncoding, RuleKind, RuleSource,
    SanitizeResult, SanitizerOptions, SanitizerRule,
};

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
    /// Index into `Sanitizer::url_tests`.
    pub url_pattern: Option<usize>,
    /// Indexes into `Sanitizer::url_tests`.
    pub exceptions: Vec<usize>,
    pub body: CompiledBody,
}

pub(crate) enum CompiledBody {
    StripParam {
        param_pattern: Regex,
        value_pattern: Option<Regex>,
        is_referral_marketing: bool,
    },
    RawReplace {
        pattern: Regex,
        replacement: String,
    },
    UnwrapRedirect {
        pattern: Regex,
        capture_group: usize,
        match_part: RedirectMatchPart,
        target_encoding: RedirectTargetEncoding,
        prepend_scheme: Option<RedirectPrependScheme>,
        target_template: Option<String>,
    },
    BlockDomain,
    KeepParam {
        /// None keeps every param.
        param_pattern: Option<Regex>,
    },
}

pub struct Sanitizer {
    pub(crate) rules: Vec<CompiledRule>,
    /// Every distinct url pattern and exception, compiled once. Many rules
    /// share them, so `sanitize` tests each one at most once per URL.
    pub(crate) url_tests: Vec<UrlTest>,
    pub(crate) options: SanitizerOptions,
}

/// A url pattern or exception: a regex run on the whole URL.
pub(crate) struct UrlTest {
    pub regex: Regex,
    /// ASCII-lowercase texts one of which every match contains; empty when
    /// unknown.
    pub literals: Vec<String>,
}

/// Interns the regexes rules test the whole URL with.
#[derive(Default)]
struct UrlTestPool {
    /// Pattern as compiled → index into `regexes`; None when it doesn't compile.
    ids: HashMap<String, Option<usize>>,
    regexes: Vec<UrlTest>,
}

impl UrlTestPool {
    fn intern(&mut self, pattern: String) -> Option<usize> {
        if let Some(id) = self.ids.get(&pattern) {
            return *id;
        }
        let id = Regex::new(&pattern).ok().map(|regex| {
            self.regexes.push(UrlTest {
                literals: required_literals(&pattern),
                regex,
            });
            self.regexes.len() - 1
        });
        self.ids.insert(pattern, id);
        id
    }

    fn url_pattern(&mut self, pattern: &str) -> Option<usize> {
        self.intern(format!("(?i){}", pattern))
    }

    /// None when any exception fails to compile: a dropped exception would
    /// widen the rule.
    fn exceptions(&mut self, list: &[String]) -> Option<Vec<usize>> {
        list.iter().map(|p| self.intern(p.clone())).collect()
    }
}

fn compile_one(r: &SanitizerRule, pool: &mut UrlTestPool) -> Option<CompiledRule> {
    fn try_re_ci(pat: &str) -> Option<Regex> {
        Regex::new(&format!("(?i){}", pat)).ok()
    }

    match r {
        SanitizerRule::StripParam {
            source,
            provider,
            url_pattern,
            param_pattern,
            value_pattern,
            exceptions,
            is_referral_marketing,
        } => {
            let pp = try_re_ci(&format!("^(?:{})$", param_pattern))?;
            let vp = match value_pattern.as_deref() {
                Some(p) => Some(try_re_ci(&format!("^(?:{})$", p))?),
                None => None,
            };
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(pool.url_pattern(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::StripParam,
                url_pattern: urlp,
                exceptions: pool.exceptions(exceptions)?,
                body: CompiledBody::StripParam {
                    param_pattern: pp,
                    value_pattern: vp,
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
                Some(p) => Some(pool.url_pattern(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::RawReplace,
                url_pattern: urlp,
                exceptions: pool.exceptions(exceptions)?,
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
            match_part,
            target_encoding,
            prepend_scheme,
            target_template,
            exceptions,
        } => {
            let p = try_re_ci(pattern)?;
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(pool.url_pattern(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::UnwrapRedirect,
                url_pattern: urlp,
                exceptions: pool.exceptions(exceptions)?,
                body: CompiledBody::UnwrapRedirect {
                    pattern: p,
                    capture_group: *capture_group as usize,
                    match_part: *match_part,
                    target_encoding: *target_encoding,
                    prepend_scheme: *prepend_scheme,
                    target_template: target_template.clone(),
                },
            })
        }
        SanitizerRule::BlockDomain {
            source,
            provider,
            url_pattern,
            exceptions,
        } => {
            let urlp = pool.url_pattern(url_pattern)?;
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::BlockDomain,
                url_pattern: Some(urlp),
                exceptions: pool.exceptions(exceptions)?,
                body: CompiledBody::BlockDomain,
            })
        }
        SanitizerRule::KeepParam {
            source,
            provider,
            url_pattern,
            param_pattern,
            exceptions,
        } => {
            let pp = match param_pattern.as_deref() {
                Some(p) => Some(try_re_ci(&format!("^(?:{})$", p))?),
                None => None,
            };
            let urlp = match url_pattern.as_deref() {
                Some(p) => Some(pool.url_pattern(p)?),
                None => None,
            };
            Some(CompiledRule {
                source: *source,
                provider: provider.clone(),
                kind: RuleKind::KeepParam,
                url_pattern: urlp,
                exceptions: pool.exceptions(exceptions)?,
                body: CompiledBody::KeepParam { param_pattern: pp },
            })
        }
        SanitizerRule::Unknown => None,
    }
}

impl Sanitizer {
    pub fn compile(rules: &[SanitizerRule], options: SanitizerOptions) -> Sanitizer {
        let mut pool = UrlTestPool::default();
        let compiled: Vec<CompiledRule> = rules
            .iter()
            .filter_map(|rule| compile_one(rule, &mut pool))
            .collect();
        Sanitizer {
            rules: compiled,
            url_tests: pool.regexes,
            options,
        }
    }

    pub fn sanitize(&self, input: &str) -> SanitizeResult {
        sanitize_with(self, input)
    }
}
