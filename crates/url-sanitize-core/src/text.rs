//! Cleaning the URLs inside text. The detection rules are normative
//! (`docs/spec.md`, "URLs in text") and must match `packages/core/src/text.ts`.

use serde::Serialize;

use crate::compile::Sanitizer;
use crate::types::SanitizeResult;

/// The outcome of cleaning every URL inside a piece of text.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TextSanitizeResult {
    /// The input with each cleaned or redirected URL replaced; everything
    /// else is kept as is.
    pub text: String,
    /// One result per URL found, in order of appearance, unchanged ones
    /// included.
    pub urls: Vec<SanitizeResult>,
}

impl Sanitizer {
    /// Find every `http://` and `https://` URL in `text`, sanitize each, and
    /// splice the cleaned URLs back in. Blocked URLs stay in the text as they
    /// were; their results are in `urls`.
    pub fn sanitize_text(&self, text: &str) -> TextSanitizeResult {
        let mut out = String::with_capacity(text.len());
        let mut urls = Vec::new();
        let mut copied = 0;
        for (start, end) in find_urls(text) {
            let result = self.sanitize(&text[start..end]);
            if let SanitizeResult::Cleaned { url, .. } | SanitizeResult::Redirected { url, .. } =
                &result
            {
                out.push_str(&text[copied..start]);
                out.push_str(url);
                copied = end;
            }
            urls.push(result);
        }
        out.push_str(&text[copied..]);
        TextSanitizeResult { text: out, urls }
    }
}

/// Byte spans `[start, end)` of the URLs in `text`. Every boundary falls
/// next to an ASCII byte or a terminator, so each is a char boundary.
fn find_urls(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let Some(scheme_len) = scheme_at(bytes, i) else {
            i += 1;
            continue;
        };
        let start = i;
        let body_start = start + scheme_len;
        i = body_start;
        // A multi-byte char before the scheme ends in a continuation byte,
        // which is not alphanumeric.
        if start > 0 && bytes[start - 1].is_ascii_alphanumeric() {
            continue;
        }
        let end = text[body_start..]
            .char_indices()
            .find(|&(_, ch)| is_terminator(ch))
            .map_or(text.len(), |(off, _)| body_start + off);
        let end = trim_end(bytes, body_start, end);
        if end == body_start {
            continue;
        }
        spans.push((start, end));
        i = end;
    }
    spans
}

/// Length of an ASCII-case-insensitive `https://` or `http://` at `i`.
fn scheme_at(bytes: &[u8], i: usize) -> Option<usize> {
    let rest = &bytes[i..];
    let starts = |prefix: &[u8]| {
        rest.len() >= prefix.len() && rest[..prefix.len()].eq_ignore_ascii_case(prefix)
    };
    if starts(b"https://") {
        Some(8)
    } else if starts(b"http://") {
        Some(7)
    } else {
        None
    }
}

/// Drop trailing punctuation, and closing brackets with no opener left
/// inside the URL. Brackets are counted once, so a long run of `)` stays
/// linear.
fn trim_end(bytes: &[u8], body_start: usize, mut end: usize) -> usize {
    const BRACKETS: &[u8; 6] = b"()[]{}";
    let mut depth = [0usize; 6];
    for b in &bytes[body_start..end] {
        if let Some(k) = BRACKETS.iter().position(|c| c == b) {
            depth[k] += 1;
        }
    }
    while end > body_start {
        let last = bytes[end - 1];
        let closer = match last {
            b')' => Some(1),
            b']' => Some(3),
            b'}' => Some(5),
            _ => None,
        };
        let unmatched = closer.is_some_and(|k| depth[k] > depth[k - 1]);
        if !matches!(
            last,
            b'.' | b',' | b':' | b';' | b'!' | b'?' | b'\'' | b'*' | b'_' | b'~'
        ) && !unmatched
        {
            break;
        }
        if let Some(k) = closer {
            depth[k] -= 1;
        }
        end -= 1;
    }
    end
}

/// Characters that end a URL. Besides whitespace, controls and `"<>` plus
/// backtick, this covers prose punctuation a copied URL never contains raw:
/// General Punctuation (Unicode spaces, smart quotes, dashes, ellipsis, bidi
/// controls), CJK punctuation, and fullwidth and halfwidth forms.
fn is_terminator(ch: char) -> bool {
    matches!(ch as u32,
        0x00..=0x20
        | 0x7f..=0xa0
        | 0x22 // "
        | 0x3c // <
        | 0x3e // >
        | 0x60 // `
        | 0x1680
        | 0x2000..=0x206f
        | 0x3000..=0x303f
        | 0xfeff
        | 0xff00..=0xffef)
}

#[cfg(test)]
mod tests {
    use super::find_urls;

    fn found(text: &str) -> Vec<&str> {
        find_urls(text)
            .into_iter()
            .map(|(s, e)| &text[s..e])
            .collect()
    }

    #[test]
    fn spans_around_multibyte_text() {
        assert_eq!(
            found("🙂https://a.example/x🙂 é"),
            vec!["https://a.example/x🙂"]
        );
        assert_eq!(
            found("链接https://a.example/x。"),
            vec!["https://a.example/x"]
        );
    }

    #[test]
    fn long_bracket_run_is_linear() {
        let text = format!("https://a.example/{}", ")".repeat(200_000));
        assert_eq!(found(&text), vec!["https://a.example/"]);
    }

    #[test]
    fn long_s_is_not_s() {
        assert!(found("httpſ://a.example/").is_empty());
    }
}
