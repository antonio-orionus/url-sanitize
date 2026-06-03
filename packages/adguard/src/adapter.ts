import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';
import type { AdguardData, AdguardMetadata } from './types.js';

interface ParsedRule {
  exceptions: string[];
  paramPattern: string;
  provider: string;
  urlPattern?: string;
  valuePattern?: string;
}

export function adguardToCatalog(data: AdguardData, meta: AdguardMetadata): SanitizerCatalog {
  const rules: SanitizerRule[] = [];
  const lines = preprocessConditionals(data.text);
  let index = 0;

  for (const line of lines) {
    const parsed = parseLine(line, index);
    if (!parsed) continue;
    index++;
    const rule: Extract<SanitizerRule, { kind: 'strip-param' }> = {
      kind: 'strip-param',
      source: 'adguard',
      provider: parsed.provider,
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

function parseLine(line: string, index: number): ParsedRule | null {
  const modifierIndex = modifierStart(line);
  if (modifierIndex === -1) return null;

  const prefix = line.slice(0, modifierIndex);
  const modifiers = parseModifiers(line.slice(modifierIndex + 1));
  const removeParam = modifiers.get('removeparam') ?? deriveParamFromPrefix(prefix);
  if (!removeParam) return null;

  const pattern = parseRemoveParam(removeParam);
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

  const urlPattern = positives.length > 0 ? domainsPattern(positives) : prefixPattern(prefix);
  const parsed: ParsedRule = {
    provider: `adguard-${index}`,
    paramPattern: pattern.paramPattern,
    exceptions: negatives.map(domainPattern)
  };
  if (urlPattern) parsed.urlPattern = urlPattern;
  if (pattern.valuePattern) parsed.valuePattern = pattern.valuePattern;
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
    const domain = prefix.slice(2).replace(/\^.*$/, '');
    return domainPattern(domain);
  }
  return globPattern(prefix.replace(/\^/g, '*'));
}

function domainsPattern(domains: string[]): string {
  return domains.map(domainPattern).join('|');
}

function domainPattern(domain: string): string {
  const escaped = escapeRegExp(domain.replace(/^\|\|/, '').replace(/\^$/, ''));
  return `^https?:\\/\\/([^/?#]+\\.)?${escaped}(?::[0-9]+)?(?:[/?#]|$)`;
}

function globPattern(glob: string): string {
  return escapeRegExp(glob).replace(/\\\*/g, '.*');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
