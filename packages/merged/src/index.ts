import { adguardCatalog, adguardMetadata } from '@url-sanitize/adguard';
import { braveCatalog, braveMetadata } from '@url-sanitize/brave';
import { clearurlsCatalog, clearurlsMetadata } from '@url-sanitize/clearurls';
import {
  compileSanitizer,
  type Sanitizer,
  type SanitizerCatalog,
  type SanitizerRule
} from '@url-sanitize/core';
import { firefoxCatalog, firefoxMetadata } from '@url-sanitize/firefox';

export interface MergeSourcesOptions {
  dedupe?: boolean;
}

const defaultCatalogs = [clearurlsCatalog, adguardCatalog, braveCatalog, firefoxCatalog];

export function mergeSources(
  catalogs: SanitizerCatalog[] = defaultCatalogs,
  options: MergeSourcesOptions = {}
): SanitizerCatalog {
  const dedupe = options.dedupe ?? true;
  const rules: SanitizerRule[] = [];
  const seen = new Set<string>();

  for (const catalog of catalogs) {
    for (const rule of catalog.rules) {
      const key = semanticRuleKey(rule);
      if (dedupe && seen.has(key)) continue;
      seen.add(key);
      rules.push(cloneRule(rule));
    }
  }

  return {
    version: `merged(${catalogs.map((catalog) => catalog.version).join(',')})`,
    generatedAt: catalogs
      .map((catalog) => catalog.generatedAt)
      .reduce((latest, generatedAt) => (generatedAt > latest ? generatedAt : latest)),
    sources: catalogs.flatMap((catalog) => catalog.sources.map((source) => ({ ...source }))),
    rules
  };
}

export const mergedCatalog: SanitizerCatalog = mergeSources();

export const mergedMetadata = {
  version: mergedCatalog.version,
  generatedAt: mergedCatalog.generatedAt,
  sources: mergedCatalog.sources,
  sourceMetadata: {
    adguard: adguardMetadata,
    brave: braveMetadata,
    clearurls: clearurlsMetadata,
    firefox: firefoxMetadata
  }
} as const;

export const sanitize: Sanitizer = compileSanitizer(mergedCatalog);

function semanticRuleKey(rule: SanitizerRule): string {
  const { provider: _provider, source: _source, ...semantic } = rule;
  return JSON.stringify(sortValue(semantic));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortValue(nested)])
  );
}

function cloneRule(rule: SanitizerRule): SanitizerRule {
  return (
    rule.exceptions ? { ...rule, exceptions: [...rule.exceptions] } : { ...rule }
  ) as SanitizerRule;
}
