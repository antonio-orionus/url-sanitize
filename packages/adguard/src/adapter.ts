import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';

import type { AdguardData, AdguardMetadata } from './types.js';

interface ParsedRule {
  /** `keep` for an `@@` allowlist line: AdGuard must not remove these params there. */
  kind: 'strip' | 'keep';
  exceptions: string[];
  /** Absent on a keep rule that protects every param. */
  paramPattern?: string;
  urlPattern?: string;
  valuePattern?: string;
}

export function adguardToCatalog(data: AdguardData, meta: AdguardMetadata): SanitizerCatalog {
  const rules: SanitizerRule[] = [];
  const lines = preprocessConditionals(data.text);
  let index = 0;
  let keepIndex = 0;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (parsed.kind === 'keep') {
      const keep: Extract<SanitizerRule, { kind: 'keep-param' }> = {
        kind: 'keep-param',
        source: 'adguard',
        provider: `adguard-keep-${keepIndex++}`,
        exceptions: parsed.exceptions
      };
      if (parsed.urlPattern) keep.urlPattern = parsed.urlPattern;
      if (parsed.paramPattern) keep.paramPattern = parsed.paramPattern;
      rules.push(keep);
      continue;
    }
    if (!parsed.paramPattern) continue;
    const rule: Extract<SanitizerRule, { kind: 'strip-param' }> = {
      kind: 'strip-param',
      source: 'adguard',
      provider: `adguard-${index++}`,
      paramPattern: parsed.paramPattern,
      exceptions: parsed.exceptions
    };
    if (parsed.urlPattern) rule.urlPattern = parsed.urlPattern;
    if (parsed.valuePattern) rule.valuePattern = parsed.valuePattern;
    rules.push(rule);
  }

  return {
    version: meta.version,
    generatedAt: meta.fetchedAt,
    sources: [
      {
        name: 'adguard',
        version: meta.version,
        hash: meta.hash,
        license: meta.license,
        upstream: meta.upstream
      }
    ],
    rules
  };
}

function preprocessConditionals(text: string): string[] {
  const activeStack: boolean[] = [true];
  const out: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('!#if')) {
      const condition = line.slice('!#if'.length).trim();
      activeStack.push(activeStack.at(-1) === true && evalCondition(condition));
      continue;
    }
    if (line.startsWith('!#else')) {
      if (activeStack.length > 1) {
        const parentActive = activeStack.at(-2) === true;
        const branchWasActive = activeStack.at(-1) === true;
        activeStack[activeStack.length - 1] = parentActive && !branchWasActive;
      }
      continue;
    }
    if (line.startsWith('!#endif')) {
      if (activeStack.length > 1) activeStack.pop();
      continue;
    }
    if (line.startsWith('!')) continue;
    if (activeStack.at(-1) !== true) continue;
    out.push(line);
  }

  return out;
}

function evalCondition(condition: string): boolean {
  return condition
    .replace(/\badguard_ext_chromium_mv3\b/g, 'false')
    .replace(/\bext_ublock\b/g, 'false')
    .split('||')
    .some((orPart) =>
      orPart.split('&&').every((andPart) => {
        const part = andPart.trim().replace(/^\(|\)$/g, '');
        if (part.startsWith('!')) return !booleanToken(part.slice(1));
        return booleanToken(part);
      })
    );
}

function booleanToken(token: string): boolean {
  return token.trim() === 'true';
}

function parseLine(rawLine: string): ParsedRule | null {
  // `@@` marks an allowlist (exception) rule: where it applies, AdGuard keeps
  // the named params, or every param for a bare `$removeparam`.
  const keep = rawLine.startsWith('@@');
  const line = keep ? rawLine.slice(2) : rawLine;
  // Allowlist modifiers may come before removeparam (`$app=…,removeparam=x`),
  // so they start at the last `$`.
  const modifierIndex = keep ? line.lastIndexOf('$') : modifierStart(line);
  if (modifierIndex === -1) return null;

  const prefix = line.slice(0, modifierIndex);
  const modifiers = parseModifiers(line.slice(modifierIndex + 1));
  let pattern: { paramPattern?: string; valuePattern?: string } | null;
  if (keep) {
    const value = modifiers.get('removeparam');
    if (value === undefined) return null;
    pattern = value === '' ? {} : parseRemoveParam(value);
  } else {
    const removeParam = modifiers.get('removeparam') ?? deriveParamFromPrefix(prefix);
    if (!removeParam) return null;
    pattern = parseRemoveParam(removeParam);
  }
  if (!pattern) return null;

  const domainModifier = modifiers.get('domain');
  const denyallow = modifiers.get('denyallow');
  const positives = domainModifier
    ? domainModifier.split('|').filter((domain) => domain.length > 0 && !domain.startsWith('~'))
    : [];
  const negatives = [
    ...(domainModifier
      ? domainModifier
          .split('|')
          .filter((domain) => domain.startsWith('~'))
          .map((domain) => domain.slice(1))
      : []),
    ...(denyallow ? denyallow.split('|').filter(Boolean) : [])
  ];

  // Keep rules get the corrected host patterns (`example.*`, `||host/path`).
  // Strip rules keep the old ones for now: about 390 of them never matched
  // (`example.*`, or `||host/dir/` followed by more path), and reviving them
  // unreviewed changed defaults (`||amazon.*^$removeparam=tag`
  // stripped affiliate tags that are kept unless stripReferralMarketing is on).
  const domain = keep ? domainPattern : legacyDomainPattern;
  const urlPattern =
    positives.length > 0
      ? positives.map(domain).join('|')
      : keep
        ? prefixPattern(prefix)
        : legacyPrefixPattern(prefix);
  const parsed: ParsedRule = {
    kind: keep ? 'keep' : 'strip',
    exceptions: negatives.map(domain)
  };
  if (pattern.paramPattern) parsed.paramPattern = pattern.paramPattern;
  if (urlPattern) parsed.urlPattern = urlPattern;
  // A keep rule matches by name; AdGuard allowlists don't filter by value.
  if (pattern.valuePattern && !keep) parsed.valuePattern = pattern.valuePattern;
  return parsed;
}

function modifierStart(line: string): number {
  const candidates = ['$removeparam', '$denyallow'];
  const indexes = candidates.map((candidate) => line.indexOf(candidate)).filter((i) => i >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function parseModifiers(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of splitModifiers(raw)) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      out.set(part.toLowerCase(), '');
    } else {
      out.set(part.slice(0, eq).toLowerCase(), part.slice(eq + 1).replace(/\\,/g, ','));
    }
  }
  return out;
}

function splitModifiers(raw: string): string[] {
  const out: string[] = [];
  let current = '';
  let inRegex = false;
  let escaped = false;

  for (const char of raw) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '/') inRegex = !inRegex;
    if (char === ',' && !inRegex) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out.filter(Boolean);
}

function parseRemoveParam(value: string): { paramPattern: string; valuePattern?: string } | null {
  if (value.startsWith('/') && value.lastIndexOf('/') > 0) {
    const body = value.slice(1, value.lastIndexOf('/')).replace(/\\,/g, ',');
    const eq = body.indexOf('=');
    if (eq > 0) {
      return {
        paramPattern: stripAnchors(body.slice(0, eq)),
        valuePattern: body.slice(eq + 1)
      };
    }
    return { paramPattern: body };
  }
  return { paramPattern: escapeRegExp(value) };
}

function stripAnchors(value: string): string {
  return value.replace(/^\^/, '').replace(/\$$/, '');
}

function deriveParamFromPrefix(prefix: string): string | null {
  const match = /[?&;/]([^?&;/*=]+)=?\*?$/.exec(prefix);
  return match?.[1] ? escapeRegExp(match[1]) : null;
}

function prefixPattern(prefix: string): string | undefined {
  if (!prefix) return undefined;
  if (prefix.startsWith('||')) {
    // `||host/path`: the host ends at the first `/`, `^` or `?`. Treating the
    // whole prefix as a host made `||shopify.com/authentication/` expect a
    // port or terminator after the path, so it never matched.
    const rest = prefix.slice(2);
    const cut = rest.search(/[/^?]/);
    const host = cut === -1 ? rest : rest.slice(0, cut);
    const tail = cut === -1 ? '' : rest.slice(cut);
    if (/^\^*$/.test(tail)) return domainPattern(host);
    return hostPattern(host) + globPattern(tail.replace(/\^/g, '*'));
  }
  return globPattern(prefix.replace(/\^/g, '*'));
}

/**
 * The pre-2.1 patterns, still used for strip rules: `||host/path` is treated
 * as one host, so `||host/dir/` misses `/dir/more`, and `*` in a host is a
 * literal, so `example.*` never matches.
 */
function legacyPrefixPattern(prefix: string): string | undefined {
  if (!prefix) return undefined;
  if (prefix.startsWith('||')) return legacyDomainPattern(prefix.slice(2).replace(/\^.*$/, ''));
  return globPattern(prefix.replace(/\^/g, '*'));
}

function legacyDomainPattern(domain: string): string {
  const escaped = escapeRegExp(domain.replace(/^\|\|/, '').replace(/\^$/, ''));
  return `^https?:\\/\\/([^/?#]+\\.)?${escaped}(?::[0-9]+)?(?:[/?#]|$)`;
}

/** `^scheme://` + optional subdomains + host + optional port. */
function hostPattern(domain: string): string {
  // `example.*` is AdGuard's any-TLD wildcard; it must stay inside the host.
  const escaped = escapeRegExp(domain.replace(/^\|\|/, '').replace(/\^$/, '')).replace(
    /\\\*/g,
    '[^/?#:]*'
  );
  return `^https?:\\/\\/([^/?#]+\\.)?${escaped}(?::[0-9]+)?`;
}

function domainPattern(domain: string): string {
  return `${hostPattern(domain)}(?:[/?#]|$)`;
}

function globPattern(glob: string): string {
  return escapeRegExp(glob).replace(/\\\*/g, '.*');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
