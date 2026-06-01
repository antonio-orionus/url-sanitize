import type { SanitizerCatalog, SanitizerRule } from './types.js';

export function defineCatalog(catalog: SanitizerCatalog): SanitizerCatalog {
  return catalog;
}

export function mergeCatalogs(
  first: SanitizerCatalog,
  ...rest: SanitizerCatalog[]
): SanitizerCatalog {
  const catalogs = [first, ...rest];
  return {
    version:
      catalogs.length === 1
        ? first.version
        : `merged(${catalogs.map((catalog) => catalog.version).join(',')})`,
    generatedAt: latestGeneratedAt(catalogs),
    sources: catalogs.flatMap((catalog) => catalog.sources.map((source) => ({ ...source }))),
    rules: catalogs.flatMap((catalog) => catalog.rules.map(cloneRule))
  };
}

function latestGeneratedAt(catalogs: SanitizerCatalog[]): string {
  return catalogs
    .map((catalog) => catalog.generatedAt)
    .reduce((latest, generatedAt) => (generatedAt > latest ? generatedAt : latest));
}

function cloneRule(rule: SanitizerRule): SanitizerRule {
  return (
    rule.exceptions ? { ...rule, exceptions: [...rule.exceptions] } : { ...rule }
  ) as SanitizerRule;
}
