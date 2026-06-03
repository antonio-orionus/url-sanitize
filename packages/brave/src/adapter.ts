import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';
import type { BraveDebounceData, BraveMetadata } from './types.js';

export function braveToCatalog(data: BraveDebounceData, meta: BraveMetadata): SanitizerCatalog {
  const rules: SanitizerRule[] = [];
  let index = 0;

  for (const upstreamRule of data) {
    const exceptions = upstreamRule.exclude.map(matchPatternToRegex);
    for (const include of upstreamRule.include) {
      const base: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
        kind: 'unwrap-redirect' as const,
        source: 'brave' as const,
        provider: `brave-debounce-${index}`,
        urlPattern: matchPatternToRegex(include),
        exceptions,
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
        throw new Error(`Unsupported Brave debounce action: ${upstreamRule.action}`);
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

function matchPatternToRegex(pattern: string): string {
  pattern = normalizedIncludePattern(pattern);
  if (pattern.startsWith('*://')) {
    return `^https?:\\/\\/${escapeRegExp(pattern.slice('*://'.length)).replace(/\\\*/g, '.*')}$`;
  }
  return `^${escapeRegExp(pattern).replace(/\\\*/g, '.*')}$`;
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
