import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';
import type { ClearUrlsData, ClearUrlsMetadata } from './types.js';

export function clearurlsToCatalog(data: ClearUrlsData, meta: ClearUrlsMetadata): SanitizerCatalog {
  const rules: SanitizerRule[] = [];

  for (const [name, provider] of Object.entries(data.providers)) {
    const exceptions = provider.exceptions ?? [];

    if (provider.completeProvider) {
      rules.push({
        kind: 'block-domain',
        source: 'clearurls',
        provider: name,
        urlPattern: provider.urlPattern,
        exceptions
      });
      continue;
    }

    for (const pattern of provider.rawRules ?? []) {
      rules.push({
        kind: 'raw-replace',
        source: 'clearurls',
        provider: name,
        urlPattern: provider.urlPattern,
        pattern,
        replacement: '',
        exceptions
      });
    }

    for (const pattern of provider.redirections ?? []) {
      rules.push({
        kind: 'unwrap-redirect',
        source: 'clearurls',
        provider: name,
        urlPattern: provider.urlPattern,
        pattern,
        captureGroup: 1,
        exceptions
      });
    }

    for (const paramPattern of provider.rules ?? []) {
      rules.push({
        kind: 'strip-param',
        source: 'clearurls',
        provider: name,
        urlPattern: provider.urlPattern,
        paramPattern,
        exceptions,
        isReferralMarketing: false
      });
    }

    for (const paramPattern of provider.referralMarketing ?? []) {
      rules.push({
        kind: 'strip-param',
        source: 'clearurls',
        provider: name,
        urlPattern: provider.urlPattern,
        paramPattern,
        exceptions,
        isReferralMarketing: true
      });
    }
  }

  return {
    version: meta.version,
    generatedAt: meta.fetchedAt,
    sources: [
      {
        name: 'clearurls',
        version: meta.version,
        hash: meta.hash,
        license: 'LGPL-3.0-only',
        upstream: meta.upstream
      }
    ],
    rules
  };
}
