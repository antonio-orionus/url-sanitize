use base64::{engine::general_purpose, Engine as _};
use percent_encoding::percent_decode_str;
use url::Url;

use crate::compile::{CompiledBody, CompiledRule};
use crate::types::{
    MatchedRule, RedirectPrependScheme, RedirectTargetEncoding, SanitizeResult, SanitizerOptions,
};

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

fn safe_base64_decode(s: &str) -> Option<String> {
    let normalized = s.replace('-', "+").replace('_', "/");
    let padded = {
        let remainder = normalized.len() % 4;
        if remainder == 0 {
            normalized.clone()
        } else {
            format!("{}{}", normalized, "=".repeat(4 - remainder))
        }
    };

    for engine in [
        &general_purpose::STANDARD,
        &general_purpose::URL_SAFE,
        &general_purpose::URL_SAFE_NO_PAD,
    ] {
        if let Ok(bytes) = engine.decode(&padded) {
            return Some(String::from_utf8_lossy(&bytes).into_owned());
        }
    }
    None
}

fn template_target(template: &str, caps: &regex_lite::Captures<'_>) -> String {
    let mut out = String::new();
    let mut chars = template.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '$' {
            if let Some(next) = chars.peek().copied() {
                if ('1'..='9').contains(&next) {
                    chars.next();
                    let index = next.to_digit(10).unwrap_or(0) as usize;
                    if let Some(mat) = caps.get(index) {
                        out.push_str(mat.as_str());
                    }
                    continue;
                }
            }
        }
        out.push(ch);
    }
    out
}

fn target_with_prepended_scheme(
    target: &str,
    scheme: Option<RedirectPrependScheme>,
) -> Option<String> {
    let Some(scheme) = scheme else {
        return Some(target.to_string());
    };
    if Url::parse(target).is_ok() {
        return None;
    }
    Some(format!(
        "{}://{}",
        scheme.as_str(),
        target.trim_start_matches('/')
    ))
}

/// Strip params matching `pattern` from a raw query/fragment body (no leading
/// `?`/`#`). Returns (kept body, removed names). Pair format preserved verbatim
/// for kept entries.
fn strip_param_pairs(
    body: &str,
    pattern: &regex_lite::Regex,
    value_pattern: Option<&regex_lite::Regex>,
) -> (String, Vec<String>) {
    let mut kept: Vec<&str> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    for pair in body.split('&').filter(|p| !p.is_empty()) {
        let name = match pair.find('=') {
            Some(idx) => &pair[..idx],
            None => pair,
        };
        let value = match pair.find('=') {
            Some(idx) => &pair[idx + 1..],
            None => "",
        };
        if pattern.is_match(name) && value_pattern.map_or(true, |p| p.is_match(value)) {
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
                match_part,
                target_encoding,
                prepend_scheme,
                target_template,
            } => {
                if !options.unwrap_redirects() {
                    continue;
                }
                let match_input = if matches!(match_part, crate::types::RedirectMatchPart::Pathname)
                {
                    let Ok(url_obj) = Url::parse(&current) else {
                        continue;
                    };
                    url_obj.path().to_string()
                } else {
                    current.clone()
                };
                let Some(caps) = pattern.captures(&match_input) else {
                    continue;
                };
                let captured = if let Some(template) = target_template {
                    template_target(template, &caps)
                } else {
                    let Some(mat) = caps.get(*capture_group) else {
                        continue;
                    };
                    mat.as_str().to_string()
                };
                if captured.is_empty() {
                    continue;
                }
                let decoded = match target_encoding {
                    RedirectTargetEncoding::Percent => safe_decode(&captured),
                    RedirectTargetEncoding::Base64 => {
                        let percent_decoded = safe_decode(&captured);
                        let Some(decoded) = safe_base64_decode(&percent_decoded) else {
                            continue;
                        };
                        decoded
                    }
                };
                let Some(target) = target_with_prepended_scheme(&decoded, *prepend_scheme) else {
                    continue;
                };
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
                value_pattern,
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
                    let (kept, removed) =
                        strip_param_pairs(q, param_pattern, value_pattern.as_ref());
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
                    let (kept, removed) =
                        strip_param_pairs(f, param_pattern, value_pattern.as_ref());
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
