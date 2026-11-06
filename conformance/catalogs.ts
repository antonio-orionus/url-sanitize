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

/** Throws on an unknown name, so a typo in a seed vector fails generation. */
export function catalogFor(name: string | undefined): SanitizerCatalog {
  if (name === undefined || name === 'default') return mergedCatalog;
  if (name === 'all-sources') return allSourcesCatalog;
  throw new Error(`unknown conformance catalog ${JSON.stringify(name)}`);
}
