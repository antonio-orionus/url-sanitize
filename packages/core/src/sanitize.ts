import type {
  MatchedRule,
  SanitizeResult,
  SanitizerCatalog,
  SanitizerOptions,
  SanitizerRule
} from './types.js';

/**
 * Normalized URLs longer than this come back `unchanged`. Every rule's regex
 * runs over the whole URL, so input length bounds the work per call.
 */
const MAX_URL_LENGTH = 8192;

/** How many nested redirect targets are sanitized again. */
const MAX_REDIRECT_DEPTH = 5;

interface CompiledStripParam {
  kind: 'strip-param';
  source: SanitizerRule extends { source: infer S } ? S : never;
  provider: string;
  urlPattern: RegExp | null;
  paramPattern: RegExp;
  valuePattern: RegExp | null;
  exceptions: RegExp[];
  isReferralMarketing: boolean;
}

interface CompiledRawReplace {
  kind: 'raw-replace';
  source: CompiledStripParam['source'];
  provider: string;
  urlPattern: RegExp | null;
  pattern: RegExp;
  replacement: string;
  exceptions: RegExp[];
}

interface CompiledUnwrapRedirect {
  kind: 'unwrap-redirect';
  source: CompiledStripParam['source'];
  provider: string;
  urlPattern: RegExp | null;
  pattern: RegExp;
  captureGroup: number;
  matchPart: 'url' | 'pathname';
  targetEncoding: 'percent' | 'base64';
  prependScheme: 'http' | 'https' | undefined;
  targetTemplate: string | undefined;
  exceptions: RegExp[];
}

interface CompiledBlockDomain {
  kind: 'block-domain';
  source: CompiledStripParam['source'];
  provider: string;
  urlPattern: RegExp;
  exceptions: RegExp[];
}

interface CompiledKeepParam {
  kind: 'keep-param';
  source: CompiledStripParam['source'];
  provider: string;
  urlPattern: RegExp | null;
  /** null keeps every param. */
  paramPattern: RegExp | null;
  exceptions: RegExp[];
}

type CompiledRule =
  | CompiledStripParam
  | CompiledRawReplace
  | CompiledUnwrapRedirect
  | CompiledBlockDomain
  | CompiledKeepParam;

function safeRegex(pattern: string, flags = ''): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Compile a pattern that is only ever tested for a match. A leading `.*`
 * cannot change whether an unanchored pattern matches, but it makes the
 * backtracking engine rescan from every start position: `.*a.*b` is cubic.
 * The original must compile too, so both engines drop the same patterns.
 */
function testRegex(pattern: string, flags: string): RegExp | null {
  const re = safeRegex(pattern, flags);
  if (!re) return null;
  const stripped = pattern.replace(/^\.\*\??/, '');
  return stripped === pattern ? re : (safeRegex(stripped, flags) ?? re);
}

type RegexCache = Map<string, RegExp | null>;

/** Returns null when any exception fails to compile: a dropped exception would widen the rule. */
function compileExceptions(patterns: string[] | undefined, cache: RegexCache): RegExp[] | null {
  if (!patterns) return [];
  const out: RegExp[] = [];
  for (const p of patterns) {
    // Shared RegExp objects let sanitize() test each distinct exception once per URL.
    if (!cache.has(p)) cache.set(p, testRegex(p, ''));
    const re = cache.get(p);
    if (!re) return null;
    out.push(re);
  }
  return out;
}

function compileRule(rule: SanitizerRule, cache: RegexCache): CompiledRule | null {
  const exceptions = compileExceptions(rule.exceptions, cache);
  if (!exceptions) return null;
  switch (rule.kind) {
    case 'strip-param': {
      const paramPattern = safeRegex(`^(?:${rule.paramPattern})$`, 'i');
      if (!paramPattern) return null;
      const valuePattern = rule.valuePattern ? safeRegex(`^(?:${rule.valuePattern})$`, 'i') : null;
      if (rule.valuePattern && !valuePattern) return null;
      const urlPattern = rule.urlPattern ? testRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'strip-param',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        paramPattern,
        valuePattern,
        exceptions,
        isReferralMarketing: rule.isReferralMarketing ?? false
      };
    }
    case 'raw-replace': {
      const pattern = safeRegex(rule.pattern, 'gi');
      if (!pattern) return null;
      const urlPattern = rule.urlPattern ? testRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'raw-replace',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        pattern,
        replacement: rule.replacement,
        exceptions
      };
    }
    case 'unwrap-redirect': {
      const pattern = safeRegex(rule.pattern, 'i');
      if (!pattern) return null;
      const urlPattern = rule.urlPattern ? testRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'unwrap-redirect',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        pattern,
        captureGroup: rule.captureGroup,
        matchPart: rule.matchPart ?? 'url',
        targetEncoding: rule.targetEncoding ?? 'percent',
        prependScheme: rule.prependScheme,
        targetTemplate: rule.targetTemplate,
        exceptions
      };
    }
    case 'block-domain': {
      const urlPattern = testRegex(rule.urlPattern, 'i');
      if (!urlPattern) return null;
      return {
        kind: 'block-domain',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        exceptions
      };
    }
    case 'keep-param': {
      const paramPattern = rule.paramPattern ? safeRegex(`^(?:${rule.paramPattern})$`, 'i') : null;
      if (rule.paramPattern && !paramPattern) return null;
      const urlPattern = rule.urlPattern ? testRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'keep-param',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        paramPattern,
        exceptions
      };
    }
    default:
      // A rule kind from a newer catalog: skip it rather than fail.
      return null;
  }
}

function hexValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return -1;
}

const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/**
 * Percent-decode byte by byte, keeping `%` sequences that aren't two hex
 * digits and replacing invalid UTF-8 with U+FFFD, like the Rust engine.
 */
function percentDecode(value: string): string {
  if (!value.includes('%')) return value;
  const bytes = new TextEncoder().encode(value);
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] as number;
    if (byte === 0x25 && i + 2 < bytes.length) {
      const hi = hexValue(bytes[i + 1] as number);
      const lo = hexValue(bytes[i + 2] as number);
      if (hi >= 0 && lo >= 0) {
        out[n++] = hi * 16 + lo;
        i += 2;
        continue;
      }
    }
    out[n++] = byte;
  }
  return utf8Decoder.decode(out.subarray(0, n));
}

/** Strict, canonical base64 (standard or URL-safe alphabet; padding optional). */
function safeBase64Decode(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = globalThis.atob(padded);
    // atob forgives whitespace and non-zero trailing bits; the Rust engine doesn't.
    if (globalThis.btoa(binary) !== padded) return null;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return utf8Decoder.decode(bytes);
  } catch {
    return null;
  }
}

function templateTarget(template: string, match: RegExpExecArray): string {
  return template.replace(/\$([1-9])/g, (_, index: string) => match[Number(index)] ?? '');
}

function targetWithPrependedScheme(
  target: string,
  scheme: 'http' | 'https' | undefined
): string | null {
  if (!scheme) return target;
  try {
    new URL(target);
    return target;
  } catch {
    return `${scheme}://${target.replace(/^\/+/, '')}`;
  }
}

/** The form rules match against: userinfo would hide the host from `^https?://host` patterns. */
function matchView(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.username && !parsed.password) return url;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

/** True when `next` parses and keeps the scheme, userinfo, host and port of `current`. */
function sameOrigin(current: string, next: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(next);
    return (
      a.protocol === b.protocol &&
      a.username === b.username &&
      a.password === b.password &&
      a.hostname === b.hostname &&
      a.port === b.port
    );
  } catch {
    return false;
  }
}

export type Sanitizer = (input: string) => SanitizeResult;

export function compileSanitizer(
  catalog: SanitizerCatalog,
  options: SanitizerOptions = {}
): Sanitizer {
  const {
    stripReferralMarketing = false,
    unwrapRedirects = true,
    domainBlocking = false
  } = options;

  const cache: RegexCache = new Map();
  const compiled: CompiledRule[] = [];
  // keep-param rules aren't iterated in order: they guard every strip-param.
  const keeps: CompiledKeepParam[] = [];
  for (const rule of catalog.rules) {
    const c = compileRule(rule, cache);
    if (c?.kind === 'keep-param') keeps.push(c);
    else if (c) compiled.push(c);
  }

  function sanitizeAt(input: string, depth: number): SanitizeResult {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      return { kind: 'unchanged', url: input };
    }

    let current = parsed.toString();
    if (current.length > MAX_URL_LENGTH) return { kind: 'unchanged', url: input };
    const original = input;
    const strippedParams: string[] = [];
    const matchedRules: MatchedRule[] = [];

    let view = matchView(current);
    let exceptionHits = new Map<RegExp, boolean>();
    let keptPatterns: (RegExp | null)[] | null = null;
    const setCurrent = (next: string): void => {
      current = next;
      view = matchView(next);
      exceptionHits = new Map();
      keptPatterns = null;
    };
    const appliesTo = (rule: CompiledRule): boolean => {
      if (rule.urlPattern && !rule.urlPattern.test(view)) return false;
      for (const re of rule.exceptions) {
        let hit = exceptionHits.get(re);
        if (hit === undefined) {
          hit = re.test(view);
          exceptionHits.set(re, hit);
        }
        if (hit) return false;
      }
      return true;
    };
    /** Whether a keep-param rule that applies to the current URL protects this decoded name. */
    const isKept = (name: string): boolean => {
      if (keeps.length === 0) return false;
      keptPatterns ??= keeps.filter(appliesTo).map((keep) => keep.paramPattern);
      return keptPatterns.some((re) => re === null || re.test(name));
    };

    for (const rule of compiled) {
      if (!appliesTo(rule)) continue;

      switch (rule.kind) {
        case 'keep-param':
          continue; // collected into `keeps` at compile time
        case 'block-domain': {
          if (!domainBlocking) continue;
          return {
            kind: 'blocked',
            original,
            via: { source: rule.source, provider: rule.provider, kind: rule.kind }
          };
        }

        case 'unwrap-redirect': {
          if (!unwrapRedirects) continue;
          let matchInput = view;
          if (rule.matchPart === 'pathname') {
            try {
              matchInput = new URL(current).pathname;
            } catch {
              continue;
            }
          }
          const m = rule.pattern.exec(matchInput);
          if (!m) continue;
          const captured =
            rule.targetTemplate !== undefined
              ? templateTarget(rule.targetTemplate, m)
              : m[rule.captureGroup];
          if (typeof captured !== 'string' || captured.length === 0) continue;
          const decodedTarget =
            rule.targetEncoding === 'base64'
              ? safeBase64Decode(percentDecode(captured))
              : percentDecode(captured);
          if (!decodedTarget) continue;
          const target = targetWithPrependedScheme(decodedTarget, rule.prependScheme);
          if (!target) continue;
          let targetUrl: URL;
          try {
            targetUrl = new URL(target);
          } catch {
            continue; // captured target isn't a valid URL
          }
          // A javascript:, data: or file: target is an attack payload, not a
          // destination: callers put `url` into links. Userinfo makes
          // `https://good.com@evil.com/` read as good.com.
          if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') continue;
          if (targetUrl.username || targetUrl.password) continue;
          const via = { source: rule.source, provider: rule.provider, kind: rule.kind };
          const href = targetUrl.toString();
          // The target gets the same treatment as the input: its tracking
          // params are stripped and a blocked domain stays blocked.
          const inner: SanitizeResult =
            depth < MAX_REDIRECT_DEPTH
              ? sanitizeAt(href, depth + 1)
              : { kind: 'unchanged', url: href };
          if (inner.kind === 'blocked') return { kind: 'blocked', original, via: inner.via };
          return { kind: 'redirected', original, url: inner.url, via };
        }

        case 'raw-replace': {
          // The replacement is literal text, and the result must stay on the
          // same origin: cleaning may only touch path, query and fragment.
          const next = current.replace(rule.pattern, () => rule.replacement);
          if (next === current || !sameOrigin(current, next)) continue;
          setCurrent(next);
          matchedRules.push({
            source: rule.source,
            provider: rule.provider,
            kind: rule.kind
          });
          continue;
        }

        case 'strip-param': {
          if (rule.isReferralMarketing && !stripReferralMarketing) continue;
          let urlObj: URL;
          try {
            urlObj = new URL(current);
          } catch {
            continue;
          }
          const search = stripFromQueryString(
            urlObj.search,
            rule.paramPattern,
            rule.valuePattern,
            isKept
          );
          const hash = stripFromQueryString(
            urlObj.hash,
            rule.paramPattern,
            rule.valuePattern,
            isKept
          );
          const removed = [...search.removed, ...hash.removed];
          if (removed.length === 0) continue;
          // Assign only the part that changed: assigning an empty search or
          // hash also drops a bare `?` or `#` the Rust engine keeps.
          if (search.removed.length > 0) urlObj.search = search.result;
          if (hash.removed.length > 0) urlObj.hash = hash.result;
          setCurrent(urlObj.toString());
          strippedParams.push(...removed);
          matchedRules.push({
            source: rule.source,
            provider: rule.provider,
            kind: rule.kind,
            detail: removed.join(',')
          });
          continue;
        }
      }
    }

    if (current === original) return { kind: 'unchanged', url: original };
    return {
      kind: 'cleaned',
      original,
      url: current,
      strippedParams,
      matchedRules
    };
  }

  return (input: string): SanitizeResult => sanitizeAt(input, 0);
}

function stripFromQueryString(
  searchOrHash: string,
  paramPattern: RegExp,
  valuePattern: RegExp | null,
  isKept: (decodedName: string) => boolean
): { result: string; removed: string[] } {
  if (!searchOrHash) return { result: searchOrHash, removed: [] };
  const prefix = searchOrHash.charAt(0);
  const body = prefix === '?' || prefix === '#' ? searchOrHash.slice(1) : searchOrHash;
  if (!body) return { result: searchOrHash, removed: [] };
  const pairs = body.split('&').filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    const name = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    const value = eqIdx === -1 ? '' : pair.slice(eqIdx + 1);
    // Names match decoded, so `utm%5Fsource` can't slip past `utm_source`.
    const decoded = percentDecode(name);
    if (
      paramPattern.test(decoded) &&
      (!valuePattern || valuePattern.test(value)) &&
      !isKept(decoded)
    ) {
      removed.push(name);
    } else {
      kept.push(pair);
    }
  }
  if (removed.length === 0) return { result: searchOrHash, removed: [] };
  if (kept.length === 0) return { result: '', removed };
  return { result: prefix + kept.join('&'), removed };
}
