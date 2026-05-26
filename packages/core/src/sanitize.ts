import type {
  MatchedRule,
  SanitizeResult,
  SanitizerCatalog,
  SanitizerOptions,
  SanitizerRule
} from './types.js';

interface CompiledStripParam {
  kind: 'strip-param';
  source: SanitizerRule extends { source: infer S } ? S : never;
  provider: string;
  urlPattern: RegExp | null;
  paramPattern: RegExp;
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
  exceptions: RegExp[];
}

interface CompiledBlockDomain {
  kind: 'block-domain';
  source: CompiledStripParam['source'];
  provider: string;
  urlPattern: RegExp;
  exceptions: RegExp[];
}

type CompiledRule =
  | CompiledStripParam
  | CompiledRawReplace
  | CompiledUnwrapRedirect
  | CompiledBlockDomain;

function safeRegex(pattern: string, flags = ''): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function compileExceptions(patterns: string[] | undefined): RegExp[] {
  if (!patterns) return [];
  const out: RegExp[] = [];
  for (const p of patterns) {
    const re = safeRegex(p, '');
    if (re) out.push(re);
  }
  return out;
}

function compileRule(rule: SanitizerRule): CompiledRule | null {
  switch (rule.kind) {
    case 'strip-param': {
      const paramPattern = safeRegex(`^(?:${rule.paramPattern})$`, 'i');
      if (!paramPattern) return null;
      const urlPattern = rule.urlPattern ? safeRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'strip-param',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        paramPattern,
        exceptions: compileExceptions(rule.exceptions),
        isReferralMarketing: rule.isReferralMarketing ?? false
      };
    }
    case 'raw-replace': {
      const pattern = safeRegex(rule.pattern, 'gi');
      if (!pattern) return null;
      const urlPattern = rule.urlPattern ? safeRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'raw-replace',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        pattern,
        replacement: rule.replacement,
        exceptions: compileExceptions(rule.exceptions)
      };
    }
    case 'unwrap-redirect': {
      const pattern = safeRegex(rule.pattern, 'i');
      if (!pattern) return null;
      const urlPattern = rule.urlPattern ? safeRegex(rule.urlPattern, 'i') : null;
      if (rule.urlPattern && !urlPattern) return null;
      return {
        kind: 'unwrap-redirect',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        pattern,
        captureGroup: rule.captureGroup,
        exceptions: compileExceptions(rule.exceptions)
      };
    }
    case 'block-domain': {
      const urlPattern = safeRegex(rule.urlPattern, 'i');
      if (!urlPattern) return null;
      return {
        kind: 'block-domain',
        source: rule.source,
        provider: rule.provider,
        urlPattern,
        exceptions: compileExceptions(rule.exceptions)
      };
    }
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchesAny(url: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(url));
}

function appliesTo(rule: CompiledRule, url: string): boolean {
  if (rule.kind !== 'block-domain' && rule.urlPattern && !rule.urlPattern.test(url)) {
    return false;
  }
  if (rule.kind === 'block-domain' && !rule.urlPattern.test(url)) return false;
  if (matchesAny(url, rule.exceptions)) return false;
  return true;
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

  const compiled: CompiledRule[] = [];
  for (const rule of catalog.rules) {
    const c = compileRule(rule);
    if (c) compiled.push(c);
  }

  return function sanitize(input: string): SanitizeResult {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      return { kind: 'unchanged', url: input };
    }

    let current = parsed.toString();
    const original = input;
    const strippedParams: string[] = [];
    const matchedRules: MatchedRule[] = [];

    for (const rule of compiled) {
      if (!appliesTo(rule, current)) continue;

      switch (rule.kind) {
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
          const m = rule.pattern.exec(current);
          const captured = m?.[rule.captureGroup];
          if (typeof captured === 'string' && captured.length > 0) {
            const target = safeDecode(captured);
            try {
              const targetUrl = new URL(target);
              return {
                kind: 'redirected',
                original,
                url: targetUrl.toString(),
                via: { source: rule.source, provider: rule.provider, kind: rule.kind }
              };
            } catch {
              // captured target isn't a valid URL — skip and continue
            }
          }
          continue;
        }

        case 'raw-replace': {
          const next = current.replace(rule.pattern, rule.replacement);
          if (next !== current) {
            current = next;
            matchedRules.push({
              source: rule.source,
              provider: rule.provider,
              kind: rule.kind
            });
          }
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
          const search = stripFromQueryString(urlObj.search, rule.paramPattern);
          const hash = stripFromQueryString(urlObj.hash, rule.paramPattern);
          const removed = [...search.removed, ...hash.removed];
          if (removed.length === 0) continue;
          urlObj.search = search.result;
          urlObj.hash = hash.result;
          current = urlObj.toString();
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
  };
}

function stripFromQueryString(
  searchOrHash: string,
  paramPattern: RegExp
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
    if (paramPattern.test(name)) {
      removed.push(name);
    } else {
      kept.push(pair);
    }
  }
  if (removed.length === 0) return { result: searchOrHash, removed: [] };
  if (kept.length === 0) return { result: '', removed };
  return { result: prefix + kept.join('&'), removed };
}
