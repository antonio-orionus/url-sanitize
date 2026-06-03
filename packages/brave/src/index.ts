import type { Sanitizer, SanitizerCatalog } from '@url-sanitize/core';
import { compileSanitizer } from '@url-sanitize/core';
import { braveToCatalog } from './adapter.js';
import { braveMetadata, braveRawData } from './raw.js';

export const braveCatalog: SanitizerCatalog = braveToCatalog(braveRawData, braveMetadata);

export const sanitize: Sanitizer = compileSanitizer(braveCatalog);

export type { BraveDebounceData, BraveDebounceRule, BraveMetadata } from './types.js';
export { braveMetadata, braveRawData, braveToCatalog };
