/**
 * The catalogs a conformance vector can run against.
 *
 * `default` is the shipped `mergedCatalog` (ClearURLs, Brave, Firefox).
 * `all-sources` adds the opt-in AdGuard source, so vectors for AdGuard rules,
 * `keep-param` among them, still run in both engines. The Rust runner reads
 * the same catalogs from `catalog/catalog.json` and `catalog/all-sources.json`.
 */
import { adguardCatalog } from '@url-sanitize/adguard';
import { braveCatalog } from '@url-sanitize/brave';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import type { SanitizerCatalog } from '@url-sanitize/core';
import { firefoxCatalog } from '@url-sanitize/firefox';
import { mergedCatalog, mergeSources } from '@url-sanitize/merged';

export type ConformanceCatalog = 'default' | 'all-sources';

export const allSourcesCatalog: SanitizerCatalog = mergeSources([
  clearurlsCatalog,
  adguardCatalog,
  braveCatalog,
  firefoxCatalog
]);

export function catalogFor(name: ConformanceCatalog | undefined): SanitizerCatalog {
  return name === 'all-sources' ? allSourcesCatalog : mergedCatalog;
}
