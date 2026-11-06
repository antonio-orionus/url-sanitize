//! A cheap substring check that rules a url test out before its regex runs.
//!
//! Most url patterns name a host (`^https?:\/\/([^/?#]+\.)?temu\.com…`), so
//! a typical URL contains the literal text of almost none of them. regex-lite
//! has no literal optimizations of its own: without this check every pattern
//! runs its PikeVM over the URL.

/// Literals of which every match of `pattern` contains at least one,
/// ASCII-lowercased. Empty when the parser below isn't sure of any.
///
/// The parser gives up on anything it doesn't fully understand: a wrong
/// literal would make a rule stop matching, a missing one only costs time.
/// Lowercase both sides and the check holds for `(?i)` too, since regex-lite's
/// case folding is ASCII-only.
pub(crate) fn required_literals(pattern: &str) -> Vec<String> {
    let chars: Vec<char> = pattern.chars().collect();
    alternation(&chars).unwrap_or_default()
}

/// Every match of `chars` contains one of the returned literals.
fn alternation(chars: &[char]) -> Option<Vec<String>> {
    let mut out = Vec::new();
    for branch in split_branches(chars)? {
        out.extend(sequence(branch)?);
    }
    out.sort();
    out.dedup();
    Some(out)
}

/// `chars` split at its top-level `|`.
fn split_branches(chars: &[char]) -> Option<Vec<&[char]>> {
    let mut branches = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            '[' => i = skip_class(chars, i)?,
            '(' => i = skip_group(chars, i)?,
            '|' => {
                branches.push(&chars[start..i]);
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }
    branches.push(&chars[start..]);
    Some(branches)
}

/// The best literal set a branch without top-level `|` must contain: a run
/// of literal characters, or the alternation inside a group that must match
/// at least once.
fn sequence(chars: &[char]) -> Option<Vec<String>> {
    let mut best: Option<Vec<String>> = None;
    let mut run = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        // The literal this atom stands for, if it is one character of text.
        let mut literal = None;
        // The alternation inside a group atom.
        let mut group: Option<&[char]> = None;
        match c {
            '|' | ')' | '*' | '+' | '?' | '{' | '}' => return None,
            '(' => {
                let end = skip_group(chars, i)?;
                let inner = &chars[i + 1..end - 1];
                group = match inner.first() {
                    Some('?') => {
                        let flags_end = inner.iter().position(|&c| c == ':' || c == '>');
                        match flags_end {
                            // `(?flags)` applies to the rest of this branch.
                            None if inner.contains(&'x') => return None,
                            None => None,
                            // `(?x:…)` changes how its body parses.
                            Some(at) if inner[..at].contains(&'x') && inner[at] == ':' => None,
                            // `(?:…)`, `(?i:…)`, `(?P<name>…)`, `(?<name>…)`.
                            Some(at) => Some(&inner[at + 1..]),
                        }
                    }
                    _ => Some(inner),
                };
                i = end;
            }
            '[' => i = skip_class(chars, i)?,
            '.' | '^' | '$' => i += 1,
            '\\' => {
                let next = *chars.get(i + 1)?;
                i += 2;
                if next.is_ascii_alphanumeric() {
                    // Classes and assertions; anything with arguments
                    // (`\x41`, `\p{L}`, `\b{start}`) gives up.
                    if !"dDwWsSbBAznrtfv".contains(next) || chars.get(i) == Some(&'{') {
                        return None;
                    }
                } else if next != '<' && next != '>' {
                    // `\<` and `\>` are word boundaries; the rest is text.
                    literal = Some(next);
                }
            }
            _ => {
                literal = Some(c);
                i += 1;
            }
        }
        let (min, end) = quantifier(chars, i)?;
        let quantified = end > i;
        i = end;
        if let Some(body) = group.filter(|_| min >= 1) {
            if let Some(found) = alternation(body) {
                keep_better(&mut best, found);
            }
        }
        match literal {
            Some(ch) if min >= 1 => {
                run.push(ch);
                // `ab+c` contains `ab` and `c`, not `abc`.
                if quantified {
                    keep_better(&mut best, vec![std::mem::take(&mut run)]);
                }
            }
            _ => keep_better(&mut best, vec![std::mem::take(&mut run)]),
        }
    }
    keep_better(&mut best, vec![run]);
    best.filter(|set| strength(set) > 0)
}

fn keep_better(best: &mut Option<Vec<String>>, candidate: Vec<String>) {
    let candidate: Vec<String> = candidate.iter().map(|s| s.to_ascii_lowercase()).collect();
    if best
        .as_ref()
        .is_none_or(|b| strength(&candidate) > strength(b))
    {
        *best = Some(candidate);
    }
}

/// How well a literal set filters: its shortest member's length, or 0 when
/// a member is too short or appears in every web URL anyway.
fn strength(set: &[String]) -> usize {
    set.iter()
        .map(|s| {
            let len = s.chars().count();
            if len < 3 || "https://".contains(s.as_str()) {
                0
            } else {
                len
            }
        })
        .min()
        .unwrap_or(0)
}

/// The quantifier at `i`, if any: (minimum repetitions, index after it).
/// No quantifier is (1, i). None when it doesn't parse.
fn quantifier(chars: &[char], i: usize) -> Option<(usize, usize)> {
    let (min, mut end) = match chars.get(i) {
        Some('?') | Some('*') => (0, i + 1),
        Some('+') => (1, i + 1),
        Some('{') => {
            let close = i + chars[i..].iter().position(|&c| c == '}')?;
            let body: String = chars[i + 1..close].iter().collect();
            let min = body.split(',').next()?.trim().parse::<usize>().ok()?;
            (min, close + 1)
        }
        _ => return Some((1, i)),
    };
    // Lazy suffix.
    if chars.get(end) == Some(&'?') {
        end += 1;
    }
    Some((min, end))
}

/// Index after the group opening at `start`.
fn skip_group(chars: &[char], start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut i = start;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 1,
            '[' => {
                i = skip_class(chars, i)?;
                continue;
            }
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Index after the character class opening at `start`. Gives up on nested
/// classes and `[:alpha:]`.
fn skip_class(chars: &[char], start: usize) -> Option<usize> {
    let mut i = start + 1;
    if chars.get(i) == Some(&'^') {
        i += 1;
    }
    // A `]` right after the opening bracket is literal.
    if chars.get(i) == Some(&']') {
        i += 1;
    }
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 1,
            '[' => return None,
            ']' => return Some(i + 1),
            _ => {}
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::required_literals;

    fn lits(pattern: &str) -> Vec<String> {
        required_literals(pattern)
    }

    #[test]
    fn host_patterns() {
        assert_eq!(
            lits(r"^https?:\/\/([^/?#]+\.)?temu\.com(?::[0-9]+)?(?:[/?#]|$)"),
            ["temu.com"]
        );
        assert_eq!(
            lits(r"(?i)^https?:\/\/(?:[a-z0-9-]+\.)*?google(?:\.[a-z]{2,}){1,}"),
            ["google"]
        );
        assert_eq!(
            lits(r"^https?:\/\/api\.Bilibili\.com"),
            ["://api.bilibili.com"]
        );
    }

    #[test]
    fn alternations() {
        assert_eq!(
            lits(r"^https?:\/\/([^/?#]+\.)?vk\.com(?::[0-9]+)?|^https?:\/\/([^/?#]+\.)?vk\.ru"),
            ["vk.com", "vk.ru"]
        );
        assert_eq!(
            lits(r"^https?:\/\/(?:[a-z0-9-]+\.)*?(?:cloudflare\.com|prismic\.io)"),
            ["cloudflare.com", "prismic.io"]
        );
        // One branch without a literal: nothing is required.
        assert!(lits(r"amazon\.com|.*").is_empty());
        // An optional group is not required.
        assert_eq!(lits(r"tracker(?:\.example\.com)?"), ["tracker"]);
        assert!(lits(r"(?:example\.com)*").is_empty());
    }

    #[test]
    fn quantifiers_end_runs() {
        assert_eq!(lits(r"abcx?def"), ["abc"]);
        assert_eq!(lits(r"abcd+efg"), ["abcd"]);
        assert_eq!(lits(r"ab{0,3}cdef"), ["cdef"]);
        assert_eq!(lits(r"ab{2}cdef"), ["cdef"]);
        assert_eq!(lits(r"abcde*?fg"), ["abcd"]);
    }

    #[test]
    fn gives_up_when_unsure() {
        assert!(lits(r"(?x) e x a m p l e").is_empty());
        assert!(lits(r"ex(?x) a m p l e").is_empty());
        assert!(lits(r"\x41bcdef").is_empty());
        assert!(lits(r"\p{L}example").is_empty());
        assert!(lits(r"[[:alpha:]]example").is_empty());
        assert!(lits(r"example)").is_empty());
        assert!(lits(r"(example").is_empty());
        assert!(lits(r".*").is_empty());
        // Only text every URL has.
        assert!(lits(r"^https?:\/\/").is_empty());
    }

    #[test]
    fn classes_and_escapes() {
        assert_eq!(lits(r"[(|)]example[\]]"), ["example"]);
        assert_eq!(lits(r"\bexample\.\*\b"), ["example.*"]);
        assert_eq!(lits(r"exam\<ple"), ["exam"]);
        assert_eq!(lits(r"exa\dmple"), ["mple"]);
    }
}
