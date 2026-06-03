import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';
import type { FirefoxMetadata, FirefoxQueryStrippingData } from './types.js';

export function firefoxToCatalog(
  data: FirefoxQueryStrippingData,
  meta: FirefoxMetadata
): SanitizerCatalog {
  const rules: SanitizerRule[] = [];

  for (const record of data.data) {
    if (record.filter_expression) {
      throw new Error(`Unsupported Firefox filter_expression in record ${record.id}`);
    }
    const exceptions = record.allowList.map(domainPattern);
    for (const param of record.stripList) {
      rules.push({
        kind: 'strip-param',
        source: 'firefox',
        provider: `firefox-${record.id}`,
        paramPattern: escapeRegExp(param),
        exceptions
      });
    }
  }

  return {
    version: meta.version,
    generatedAt: meta.fetchedAt,
    sources: [
      {
        name: 'firefox',
        version: meta.version,
        hash: meta.hash,
        license: meta.license,
        upstream: meta.upstream
      }
    ],
    rules
  };
}

function domainPattern(domain: string): string {
  const escaped = escapeRegExp(domain);
  return `^https?:\\/\\/([^/?#]+\\.)?${escaped}(?::[0-9]+)?(?:[/?#]|$)`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
