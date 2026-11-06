use base64::{engine::general_purpose, Engine as _};
use percent_encoding::percent_decode_str;
use url::Url;

use crate::compile::{CompiledBody, CompiledRule, Sanitizer, UrlTest};
use crate::types::{MatchedRule, RedirectPrependScheme, RedirectTargetEncoding, SanitizeResult};

/// Normalized URLs longer than this come back `Unchanged`. Every rule's regex
/// runs over the whole URL, so input length bounds the work per call.
const MAX_URL_LENGTH: usize = 8192;

/// How many nested redirect targets are sanitized again.
const MAX_REDIRECT_DEPTH: usize = 5;

/// The form rules match against for one URL state, and which of the
/// sanitizer's url tests (url patterns and exceptions) it matches. Each test
/// runs at most once per state, however many rules share it.
struct UrlView<'a> {
    tests: &'a [UrlTest],
    view: String,
    /// `view` ASCII-lowercased, for the literal prefilter.
    lower: String,
    /// Per test: 0 not run yet, 1 no match, 2 match.
    hits: Vec<u8>,
}

impl<'a> UrlView<'a> {
    fn new(tests: &'a [UrlTest], url: &str) -> Self {
        let view = match_view(url);
        UrlView {
            tests,
            lower: view.to_ascii_lowercase(),
            view,
            hits: vec![0; tests.len()],
        }
    }

    fn set(&mut self, url: &str) {
        self.view = match_view(url);
        self.lower = self.view.to_ascii_lowercase();
        self.hits.fill(0);
    }

    fn as_str(&self) -> &str {
        &self.view
    }

    fn matches(&mut self, test: usize) -> bool {
        if self.hits[test] == 0 {
            let UrlTest { regex, literals } = &self.tests[test];
            let possible =
                literals.is_empty() || literals.iter().any(|lit| self.lower.contains(lit.as_str()));
            // Debug builds (the conformance and hardening tests) check the
            // prefilter never rules out a match.
            debug_assert!(
                possible || !regex.is_match(&self.view),
                "literals {literals:?} ruled out {:?} matching {:?}",
                regex.as_str(),
                self.view
            );
            self.hits[test] = if possible && regex.is_match(&self.view) {
                2
            } else {
                1
            };
        }
        self.hits[test] == 2
    }

    fn applies_to(&mut self, rule: &CompiledRule) -> bool {
        if let Some(test) = rule.url_pattern {
            if !self.matches(test) {
                return false;
            }
        }
        !rule.exceptions.iter().any(|&test| self.matches(test))
    }
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
fn kept_patterns<'a>(
    keeps: &[&'a CompiledRule],
    view: &mut UrlView<'_>,
) -> Vec<Option<&'a regex_lite::Regex>> {
    keeps
        .iter()
        .filter(|rule| view.applies_to(rule))
        .filter_map(|rule| match &rule.body {
            CompiledBody::KeepParam { param_pattern } => Some(param_pattern.as_ref()),
            _ => None,
        })
        .collect()
}

fn is_kept(kept: &[Option<&regex_lite::Regex>], decoded_name: &str) -> bool {
    kept.iter()
        .any(|re| re.is_none_or(|re| re.is_match(decoded_name)))
}

/// One `name[=value]` pair of a query or fragment body.
struct ParamPair {
    /// The pair as written, kept verbatim when it survives.
    pair: String,
    name_len: usize,
    /// Names match decoded, so `utm%5Fsource` can't slip past `utm_source`.
    decoded: String,
}

impl ParamPair {
    fn name(&self) -> &str {
        &self.pair[..self.name_len]
    }

    fn value(&self) -> &str {
        self.pair.get(self.name_len + 1..).unwrap_or("")
    }
}

/// The query and fragment of one URL state, split and decoded once for every
/// strip-param rule.
struct UrlParams {
    query: Vec<ParamPair>,
    fragment: Vec<ParamPair>,
}

/// None when `url` doesn't parse.
fn parse_url_params(url: &str) -> Option<UrlParams> {
    let parsed = Url::parse(url).ok()?;
    Some(UrlParams {
        query: parse_param_pairs(parsed.query().unwrap_or("")),
        fragment: parse_param_pairs(parsed.fragment().unwrap_or("")),
    })
}

/// Split a raw query/fragment body (no leading `?`/`#`) into pairs.
fn parse_param_pairs(body: &str) -> Vec<ParamPair> {
    body.split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let name_len = pair.find('=').unwrap_or(pair.len());
            ParamPair {
                pair: pair.to_string(),
                name_len,
                decoded: safe_decode(&pair[..name_len]),
            }
        })
        .collect()
}

/// Strip params matching `pattern`. Returns (kept body, removed names). Pair
/// format preserved verbatim for kept entries.
fn strip_param_pairs(
    pairs: &[ParamPair],
    pattern: &regex_lite::Regex,
    value_pattern: Option<&regex_lite::Regex>,
    keep: &[Option<&regex_lite::Regex>],
) -> (String, Vec<String>) {
    let mut kept: Vec<&str> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    for p in pairs {
        if pattern.is_match(&p.decoded)
            && value_pattern.is_none_or(|re| re.is_match(p.value()))
            && !is_kept(keep, &p.decoded)
        {
            removed.push(p.name().to_string());
        } else {
            kept.push(&p.pair);
        }
    }
    (kept.join("&"), removed)
}

pub(crate) fn sanitize_with(sanitizer: &Sanitizer, input: &str) -> SanitizeResult {
    sanitize_at(sanitizer, input, 0)
}

fn sanitize_at(sanitizer: &Sanitizer, input: &str, depth: usize) -> SanitizeResult {
    let rules = &sanitizer.rules;
    let options = &sanitizer.options;
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
    let mut view = UrlView::new(&sanitizer.url_tests, &current);
    // keep-param rules aren't iterated in order: they guard every strip-param.
    let keeps: Vec<&CompiledRule> = rules
        .iter()
        .filter(|rule| matches!(rule.body, CompiledBody::KeepParam { .. }))
        .collect();
    let mut kept_cache: Option<Vec<Option<&regex_lite::Regex>>> = None;
    // Outer None: not parsed for this `current` yet; inner None: unparsable.
    let mut params_cache: Option<Option<UrlParams>> = None;
    let mut stripped_params: Vec<String> = Vec::new();
    let mut matched_rules: Vec<MatchedRule> = Vec::new();

    for rule in rules {
        if !view.applies_to(rule) {
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
                    view.as_str().to_string()
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
                    sanitize_at(sanitizer, &href, depth + 1)
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
                view.set(&current);
                kept_cache = None;
                params_cache = None;
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
                let Some(params) = params_cache
                    .get_or_insert_with(|| parse_url_params(&current))
                    .as_ref()
                else {
                    continue;
                };
                let kept = kept_cache.get_or_insert_with(|| kept_patterns(&keeps, &mut view));
                let value_pattern = value_pattern.as_ref();
                let (query_rest, query_removed) =
                    strip_param_pairs(&params.query, param_pattern, value_pattern, kept);
                let (fragment_rest, fragment_removed) =
                    strip_param_pairs(&params.fragment, param_pattern, value_pattern, kept);
                if query_removed.is_empty() && fragment_removed.is_empty() {
                    continue;
                }
                // It parsed a moment ago, as `params` did.
                let Ok(mut url_obj) = Url::parse(&current) else {
                    continue;
                };
                if !query_removed.is_empty() {
                    url_obj.set_query((!query_rest.is_empty()).then_some(query_rest.as_str()));
                }
                if !fragment_removed.is_empty() {
                    url_obj.set_fragment(
                        (!fragment_rest.is_empty()).then_some(fragment_rest.as_str()),
                    );
                }
                let mut all_removed = query_removed;
                all_removed.extend(fragment_removed);
                current = url_obj.to_string();
                view.set(&current);
                kept_cache = None;
                params_cache = None;
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
