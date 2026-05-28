use percent_encoding::percent_decode_str;
use url::Url;

use crate::compile::{CompiledBody, CompiledRule};
use crate::types::{MatchedRule, SanitizeResult, SanitizerOptions};

fn applies_to(rule: &CompiledRule, current: &str) -> bool {
    if let Some(re) = &rule.url_pattern {
        if !re.is_match(current) {
            return false;
        }
    }
    for ex in &rule.exceptions {
        if ex.is_match(current) {
            return false;
        }
    }
    true
}

fn safe_decode(s: &str) -> String {
    percent_decode_str(s).decode_utf8_lossy().into_owned()
}

/// Strip params matching `pattern` from a raw query/fragment body (no leading
/// `?`/`#`). Returns (kept body, removed names). Pair format preserved verbatim
/// for kept entries.
fn strip_param_pairs(body: &str, pattern: &regex_lite::Regex) -> (String, Vec<String>) {
    let mut kept: Vec<&str> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    for pair in body.split('&').filter(|p| !p.is_empty()) {
        let name = match pair.find('=') {
            Some(idx) => &pair[..idx],
            None => pair,
        };
        if pattern.is_match(name) {
            removed.push(name.to_string());
        } else {
            kept.push(pair);
        }
    }
    (kept.join("&"), removed)
}

pub(crate) fn sanitize_with(
    rules: &[CompiledRule],
    options: &SanitizerOptions,
    input: &str,
) -> SanitizeResult {
    let parsed = match Url::parse(input) {
        Ok(u) => u,
        Err(_) => {
            return SanitizeResult::Unchanged {
                url: input.to_string(),
            }
        }
    };

    let original = input.to_string();
    let mut current = parsed.to_string();
    let mut stripped_params: Vec<String> = Vec::new();
    let mut matched_rules: Vec<MatchedRule> = Vec::new();

    for rule in rules {
        if !applies_to(rule, &current) {
            continue;
        }
        match &rule.body {
            CompiledBody::BlockDomain => {
                if !options.domain_blocking {
                    continue;
                }
                return SanitizeResult::Blocked {
                    original,
                    via: MatchedRule {
                        source: rule.source,
                        provider: rule.provider.clone(),
                        kind: rule.kind,
                        detail: None,
                    },
                };
            }
            CompiledBody::UnwrapRedirect {
                pattern,
                capture_group,
            } => {
                if !options.unwrap_redirects() {
                    continue;
                }
                let Some(caps) = pattern.captures(&current) else {
                    continue;
                };
                let Some(mat) = caps.get(*capture_group) else {
                    continue;
                };
                let captured = mat.as_str();
                if captured.is_empty() {
                    continue;
                }
                let target = safe_decode(captured);
                let Ok(target_url) = Url::parse(&target) else {
                    continue;
                };
                return SanitizeResult::Redirected {
                    original,
                    url: target_url.to_string(),
                    via: MatchedRule {
                        source: rule.source,
                        provider: rule.provider.clone(),
                        kind: rule.kind,
                        detail: None,
                    },
                };
            }
            CompiledBody::RawReplace {
                pattern,
                replacement,
            } => {
                let next = pattern.replace_all(&current, replacement.as_str());
                if next != current {
                    current = next.into_owned();
                    matched_rules.push(MatchedRule {
                        source: rule.source,
                        provider: rule.provider.clone(),
                        kind: rule.kind,
                        detail: None,
                    });
                }
            }
            CompiledBody::StripParam {
                param_pattern,
                is_referral_marketing,
            } => {
                if *is_referral_marketing && !options.strip_referral_marketing {
                    continue;
                }
                let Ok(mut url_obj) = Url::parse(&current) else {
                    continue;
                };

                let mut all_removed: Vec<String> = Vec::new();

                // Query
                if let Some(q) = url_obj.query() {
                    let (kept, removed) = strip_param_pairs(q, param_pattern);
                    if !removed.is_empty() {
                        if kept.is_empty() {
                            url_obj.set_query(None);
                        } else {
                            url_obj.set_query(Some(&kept));
                        }
                        all_removed.extend(removed);
                    }
                }

                // Fragment-as-query
                if let Some(f) = url_obj.fragment() {
                    let (kept, removed) = strip_param_pairs(f, param_pattern);
                    if !removed.is_empty() {
                        if kept.is_empty() {
                            url_obj.set_fragment(None);
                        } else {
                            url_obj.set_fragment(Some(&kept));
                        }
                        all_removed.extend(removed);
                    }
                }

                if all_removed.is_empty() {
                    continue;
                }
                current = url_obj.to_string();
                let detail = all_removed.join(",");
                stripped_params.extend(all_removed);
                matched_rules.push(MatchedRule {
                    source: rule.source,
                    provider: rule.provider.clone(),
                    kind: rule.kind,
                    detail: Some(detail),
                });
            }
        }
    }

    if current == original {
        return SanitizeResult::Unchanged { url: original };
    }
    SanitizeResult::Cleaned {
        original,
        url: current,
        stripped_params,
        matched_rules,
    }
}
