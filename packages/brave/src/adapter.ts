import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';

import type { BraveDebounceData, BraveMetadata } from './types.js';

export function braveToCatalog(data: BraveDebounceData, meta: BraveMetadata): SanitizerCatalog {
  const rules: SanitizerRule[] = [];
  let index = 0;

  for (const upstreamRule of data) {
    // The daily sync runs unattended, so an unknown pattern shape skips its
    // rule (the URL stays wrapped) instead of failing every update. An
    // unknown exclude drops the whole rule: ignoring it would widen it.
    const exceptions = upstreamRule.exclude.map(matchPatternToRegex);
    if (exceptions.includes(null)) {
      console.warn(
        `brave: skipping rule with unsupported exclude: ${upstreamRule.exclude.join(' ')}`
      );
      continue;
    }
    for (const include of upstreamRule.include) {
      const urlPattern = matchPatternToRegex(include);
      if (urlPattern === null) {
        console.warn(`brave: skipping unsupported include pattern: ${include}`);
        continue;
      }
      const base: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
        kind: 'unwrap-redirect' as const,
        source: 'brave' as const,
        provider: `brave-debounce-${index}`,
        urlPattern,
        exceptions: exceptions as string[],
        pattern: upstreamRule.param,
        captureGroup: 1
      };
      if (upstreamRule.prepend_scheme) base.prependScheme = upstreamRule.prepend_scheme;

      if (upstreamRule.action === 'redirect' || upstreamRule.action === 'base64,redirect') {
        rules.push({
          ...base,
          pattern: `[?&]${escapeRegExp(upstreamRule.param)}=([^&]+)`,
          captureGroup: 1,
          targetEncoding: upstreamRule.action === 'base64,redirect' ? 'base64' : 'percent'
        });
      } else if (upstreamRule.action === 'regex-path') {
        const pathRule: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
          ...base,
          pattern: upstreamRule.param,
          captureGroup: 1,
          matchPart: 'pathname'
        };
        if (upstreamRule.redirect_url_template) {
          pathRule.targetTemplate = upstreamRule.redirect_url_template;
        } else {
          const captureTemplate = captureGroupsTemplate(upstreamRule.param);
          if (captureTemplate) pathRule.targetTemplate = captureTemplate;
        }
        rules.push(pathRule);
      } else if (upstreamRule.action === 'regex-path-template') {
        const templateRule: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
          ...base,
          pattern: upstreamRule.param,
          captureGroup: 1,
          matchPart: 'pathname'
        };
        if (upstreamRule.redirect_url_template) {
          templateRule.targetTemplate = upstreamRule.redirect_url_template;
        }
        rules.push(templateRule);
      } else {
        console.warn(`brave: skipping rule with unsupported action: ${upstreamRule.action}`);
        continue;
      }
      index++;
    }
  }

  return {
    version: meta.version,
    generatedAt: meta.fetchedAt,
    sources: [
      {
        name: 'brave',
        version: meta.version,
        hash: meta.hash,
        license: meta.license,
        upstream: meta.upstream
      }
    ],
    rules
  };
}

/** Host characters: a host wildcard must not reach into the path or query. */
const HOST_CHARS = '[^/?#]';

/**
 * Convert a WebExtension match pattern (`scheme://host/path`) to a regex.
 * `*` as the host is any host, a leading `*.` is the domain or any subdomain,
 * and `*` in the path is anything. Replacing every `*` with `.*` let
 * `*://*.ouo.today/*` match `https://evil.com/x.ouo.today/`. Returns null
 * for a shape it doesn't know.
 */
function matchPatternToRegex(pattern: string): string | null {
  pattern = normalizedIncludePattern(pattern);
  const match = /^(\*|https?):\/\/([^/]*)(\/.*)?$/.exec(pattern);
  if (!match) return null;
  const [, scheme = '*', host = '', path = '/'] = match;
  const schemeRe = scheme === '*' ? 'https?' : scheme;
  let hostRe: string;
  if (host === '*') {
    hostRe = `${HOST_CHARS}+`;
  } else if (host.startsWith('*.')) {
    hostRe = `(?:${HOST_CHARS}+\\.)?${escapeRegExp(host.slice(2))}`;
  } else if (host.includes('*')) {
    return null;
  } else {
    hostRe = escapeRegExp(host);
  }
  const pathRe = escapeRegExp(path).replace(/\\\*/g, '.*');
  return `^${schemeRe}:\\/\\/${hostRe}${pathRe}$`;
}

function normalizedIncludePattern(pattern: string): string {
  if (pattern === '*://www.tkqlhce.com/click-') return `${pattern}*`;
  if (pattern === '*://t.lever-analytics.com/email-link?') return `${pattern}*`;
  return pattern;
}

function captureGroupsTemplate(pattern: string): string | undefined {
  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '(') continue;
    if (i > 0 && pattern[i - 1] === '\\') continue;
    if (pattern[i + 1] === '?') continue;
    count++;
  }
  if (count <= 1) return undefined;
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
