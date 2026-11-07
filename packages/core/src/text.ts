import type { Sanitizer } from './sanitize.js';
import type { SanitizeResult } from './types.js';

/** The outcome of cleaning every URL inside a piece of text. */
export interface TextSanitizeResult {
  /** The input with each cleaned or redirected URL replaced; everything else is kept as is. */
  text: string;
  /** One result per URL found, in order of appearance, unchanged ones included. */
  urls: SanitizeResult[];
}

// The detection rules are normative (docs/spec.md, "URLs in text") and must
// match `text.rs` in the Rust core. Every character they test is in the BMP,
// so scanning UTF-16 code units gives the same spans as scanning code points.
// No `u` flag: with it, `i` would let U+017F (ſ) match `s`.
const SCHEME = /https?:\/\//gi;
const TRAILING = new Set(['.', ',', ':', ';', '!', '?', "'", '*', '_', '~']);
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const BRACKETS = '()[]{}';

/**
 * Find every `http://` and `https://` URL in `text`, run each through
 * `sanitize`, and splice the cleaned URLs back in. Blocked URLs stay in the
 * text as they were; their results are in `urls`.
 */
export function sanitizeText(text: string, sanitize: Sanitizer): TextSanitizeResult {
  const urls: SanitizeResult[] = [];
  let out = '';
  let copied = 0;
  for (const [start, end] of findUrls(text)) {
    const original = text.slice(start, end);
    const result = sanitize(original);
    urls.push(result);
    if (result.kind === 'cleaned' || result.kind === 'redirected') {
      out += text.slice(copied, start) + result.url;
      copied = end;
    }
  }
  return { text: copied === 0 ? text : out + text.slice(copied), urls };
}

/** Spans `[start, end)` of the URLs in `text`, as UTF-16 offsets. */
function findUrls(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  SCHEME.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCHEME.exec(text)) !== null) {
    const start = match.index;
    const bodyStart = start + match[0].length;
    if (start > 0 && isAsciiAlphanumeric(text.charCodeAt(start - 1))) continue;
    let end = bodyStart;
    while (end < text.length && !isTerminator(text.charCodeAt(end))) end++;
    end = trimEnd(text, bodyStart, end);
    if (end === bodyStart) continue;
    spans.push([start, end]);
    SCHEME.lastIndex = end;
  }
  return spans;
}

/**
 * Drop trailing punctuation, and closing brackets with no opener left inside
 * the URL. Brackets are counted once, so a long run of `)` stays linear.
 */
function trimEnd(text: string, bodyStart: number, end: number): number {
  const depth = new Map<string, number>();
  for (let i = bodyStart; i < end; i++) {
    const ch = text[i]!;
    if (BRACKETS.includes(ch)) depth.set(ch, (depth.get(ch) ?? 0) + 1);
  }
  while (end > bodyStart) {
    const last = text[end - 1]!;
    const opener = CLOSERS[last];
    const unmatched = opener !== undefined && (depth.get(last) ?? 0) > (depth.get(opener) ?? 0);
    if (!TRAILING.has(last) && !unmatched) break;
    if (opener !== undefined) depth.set(last, (depth.get(last) ?? 0) - 1);
    end--;
  }
  return end;
}

function isAsciiAlphanumeric(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/**
 * Characters that end a URL. Besides whitespace, controls and `"<>` plus
 * backtick, this covers prose punctuation a copied URL never contains raw:
 * General Punctuation (Unicode spaces, smart quotes, dashes, ellipsis, bidi
 * controls), CJK punctuation, and fullwidth and halfwidth forms. Kept inside
 * the URL, a trailing `”` or `。` would land in a stripped param's value and
 * vanish from the text.
 */
function isTerminator(c: number): boolean {
  return (
    c <= 0x20 ||
    (c >= 0x7f && c <= 0xa0) ||
    c === 0x22 || // "
    c === 0x3c || // <
    c === 0x3e || // >
    c === 0x60 || // `
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x206f) ||
    (c >= 0x3000 && c <= 0x303f) ||
    c === 0xfeff ||
    (c >= 0xff00 && c <= 0xffef)
  );
}
