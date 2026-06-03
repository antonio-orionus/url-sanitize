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
        rules.push({
          ...base,
          pattern: upstreamRule.param,
          captureGroup: 1,
          matchPart: 'pathname'
        });
      } else {
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
  return `^${escapeRegExp(pattern)
    .replace(/^\\\*:\/\\\//, 'https?:\\/\\/')
    .replace(/\\\*/g, '.*')}$`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
