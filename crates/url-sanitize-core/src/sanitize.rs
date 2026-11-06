use base64::{engine::general_purpose, Engine as _};
use percent_encoding::percent_decode_str;
use url::Url;

use crate::compile::{CompiledBody, CompiledRule};
use crate::types::{
    MatchedRule, RedirectPrependScheme, RedirectTargetEncoding, SanitizeResult, SanitizerOptions,
};

/// Normalized URLs longer than this come back `Unchanged`. Every rule's regex
/// runs over the whole URL, so input length bounds the work per call.
const MAX_URL_LENGTH: usize = 8192;

/// How many nested redirect targets are sanitized again.
const MAX_REDIRECT_DEPTH: usize = 5;

fn applies_to(rule: &CompiledRule, view: &str) -> bool {
    if let Some(re) = &rule.url_pattern {
        if !re.is_match(view) {
            return false;
        }
    }
    for ex in &rule.exceptions {
        if ex.is_match(view) {
            return false;
        }
    }
    true
}

fn safe_decode(s: &str) -> String {
    percent_decode_str(s).decode_utf8_lossy().into_owned()
}

/// Strict, canonical base64 (standard or URL-safe alphabet; padding optional).
fn safe_base64_decode(s: &str) -> Option<String> {
    let normalized = s.replace('-', "+").replace('_', "/");
    let remainder = normalized.len() % 4;
    let padded = if remainder == 0 {
        normalized
    } else {
        format!("{}{}", normalized, "=".repeat(4 - remainder))
    };
    let bytes = general_purpose::STANDARD.decode(&padded).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
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
        return Some(target.to_string());
    }
    Some(format!(
        "{}://{}",
        scheme.as_str(),
        target.trim_start_matches('/')
    ))
}

/// The form rules match against: userinfo would hide the host from
/// `^https?://host` patterns.
fn match_view(url: &str) -> String {
    match Url::parse(url) {
        Ok(mut parsed) if !parsed.username().is_empty() || parsed.password().is_some() => {
            let _ = parsed.set_username("");
            let _ = parsed.set_password(None);
            parsed.to_string()
        }
        _ => url.to_string(),
    }
}

/// True when `next` parses and keeps the scheme, userinfo, host and port of
/// `current`.
fn same_origin(current: &str, next: &str) -> bool {
    let (Ok(a), Ok(b)) = (Url::parse(current), Url::parse(next)) else {
        return false;
    };
    a.scheme() == b.scheme()
        && a.username() == b.username()
        && a.password().unwrap_or("") == b.password().unwrap_or("")
        && a.host_str() == b.host_str()
        && a.port() == b.port()
}

/// The keep-param patterns that apply to `view`; a `None` entry keeps every
/// param.
fn kept_patterns<'a>(keeps: &[&'a CompiledRule], view: &str) -> Vec<Option<&'a regex_lite::Regex>> {
    keeps
        .iter()
        .filter(|rule| applies_to(rule, view))
        .filter_map(|rule| match &rule.body {
            CompiledBody::KeepParam { param_pattern } => Some(param_pattern.as_ref()),
            _ => None,
        })
        .collect()
}

fn is_kept(kept: &[Option<&regex_lite::Regex>], decoded_name: &str) -> bool {
    kept.iter()
        .any(|re| re.map_or(true, |re| re.is_match(decoded_name)))
}

/// Strip params matching `pattern` from a raw query/fragment body (no leading
/// `?`/`#`). Returns (kept body, removed names). Pair format preserved verbatim
/// for kept entries.
fn strip_param_pairs(
    body: &str,
    pattern: &regex_lite::Regex,
    value_pattern: Option<&regex_lite::Regex>,
    keep: &[Option<&regex_lite::Regex>],
) -> (String, Vec<String>) {
    let mut kept: Vec<&str> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    for pair in body.split('&').filter(|p| !p.is_empty()) {
        let (name, value) = match pair.find('=') {
            Some(idx) => (&pair[..idx], &pair[idx + 1..]),
            None => (pair, ""),
        };
        // Names match decoded, so `utm%5Fsource` can't slip past `utm_source`.
        let decoded = safe_decode(name);
        if pattern.is_match(&decoded)
            && value_pattern.map_or(true, |p| p.is_match(value))
            && !is_kept(keep, &decoded)
        {
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
    sanitize_at(rules, options, input, 0)
}

fn sanitize_at(
    rules: &[CompiledRule],
    options: &SanitizerOptions,
    input: &str,
    depth: usize,
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
    if current.len() > MAX_URL_LENGTH {
        return SanitizeResult::Unchanged { url: original };
    }
    let mut view = match_view(&current);
    // keep-param rules aren't iterated in order: they guard every strip-param.
    let keeps: Vec<&CompiledRule> = rules
        .iter()
        .filter(|rule| matches!(rule.body, CompiledBody::KeepParam { .. }))
        .collect();
    let mut kept_cache: Option<Vec<Option<&regex_lite::Regex>>> = None;
    let mut stripped_params: Vec<String> = Vec::new();
    let mut matched_rules: Vec<MatchedRule> = Vec::new();

    for rule in rules {
        if !applies_to(rule, &view) {
            continue;
        }
        match &rule.body {
            CompiledBody::KeepParam { .. } => continue,
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
                    view.clone()
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
                if decoded.is_empty() {
                    continue;
                }
                let Some(target) = target_with_prepended_scheme(&decoded, *prepend_scheme) else {
                    continue;
                };
                let Ok(target_url) = Url::parse(&target) else {
                    continue;
                };
                // A javascript:, data: or file: target is an attack payload,
                // not a destination: callers put `url` into links. Userinfo
                // makes `https://good.com@evil.com/` read as good.com.
                if !matches!(target_url.scheme(), "http" | "https") {
                    continue;
                }
                if !target_url.username().is_empty() || target_url.password().is_some() {
                    continue;
                }
                let via = MatchedRule {
                    source: rule.source,
                    provider: rule.provider.clone(),
                    kind: rule.kind,
                    detail: None,
                };
                let href = target_url.to_string();
                // The target gets the same treatment as the input: its
                // tracking params are stripped and a blocked domain stays
                // blocked.
                let inner = if depth < MAX_REDIRECT_DEPTH {
                    sanitize_at(rules, options, &href, depth + 1)
                } else {
                    SanitizeResult::Unchanged { url: href }
                };
                let url = match inner {
                    SanitizeResult::Blocked { via, .. } => {
                        return SanitizeResult::Blocked { original, via };
                    }
                    SanitizeResult::Unchanged { url }
                    | SanitizeResult::Cleaned { url, .. }
                    | SanitizeResult::Redirected { url, .. } => url,
                };
                return SanitizeResult::Redirected { original, url, via };
            }
            CompiledBody::RawReplace {
                pattern,
                replacement,
            } => {
                // The replacement is literal text, and the result must stay
                // on the same origin: cleaning may only touch path, query and
                // fragment.
                let next = pattern.replace_all(&current, regex_lite::NoExpand(replacement));
                if next == current || !same_origin(&current, &next) {
                    continue;
                }
                current = next.into_owned();
                view = match_view(&current);
                kept_cache = None;
                matched_rules.push(MatchedRule {
                    source: rule.source,
                    provider: rule.provider.clone(),
                    kind: rule.kind,
                    detail: None,
                });
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

                let kept = kept_cache.get_or_insert_with(|| kept_patterns(&keeps, &view));
                let mut all_removed: Vec<String> = Vec::new();

                // Query
                if let Some(q) = url_obj.query() {
                    let (rest, removed) =
                        strip_param_pairs(q, param_pattern, value_pattern.as_ref(), kept);
                    if !removed.is_empty() {
                        if rest.is_empty() {
                            url_obj.set_query(None);
                        } else {
                            url_obj.set_query(Some(&rest));
                        }
                        all_removed.extend(removed);
                    }
                }

                // Fragment-as-query
                if let Some(f) = url_obj.fragment() {
                    let (rest, removed) =
                        strip_param_pairs(f, param_pattern, value_pattern.as_ref(), kept);
                    if !removed.is_empty() {
                        if rest.is_empty() {
                            url_obj.set_fragment(None);
                        } else {
                            url_obj.set_fragment(Some(&rest));
                        }
                        all_removed.extend(removed);
                    }
                }

                if all_removed.is_empty() {
                    continue;
                }
                current = url_obj.to_string();
                view = match_view(&current);
                kept_cache = None;
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
