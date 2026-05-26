import { compileSanitizer } from '@url-sanitize/core';
import type { Sanitizer, SanitizerCatalog } from '@url-sanitize/core';
import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import { clearurlsToCatalog } from './adapter.js';
import type { ClearUrlsData, ClearUrlsMetadata } from './types.js';

export const clearurlsCatalog: SanitizerCatalog = clearurlsToCatalog(
  rawData as ClearUrlsData,
  metadata as ClearUrlsMetadata
);

export const clearurlsMetadata: ClearUrlsMetadata = metadata as ClearUrlsMetadata;

export const sanitize: Sanitizer = compileSanitizer(clearurlsCatalog);

export { clearurlsToCatalog };
export type { ClearUrlsData, ClearUrlsMetadata, ClearUrlsProvider } from './types.js';
