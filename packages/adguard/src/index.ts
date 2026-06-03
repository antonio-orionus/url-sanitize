import type { Sanitizer, SanitizerCatalog } from '@url-sanitize/core';
import { compileSanitizer } from '@url-sanitize/core';
import { adguardToCatalog } from './adapter.js';
import { adguardMetadata, adguardRawData } from './raw.js';

export const adguardCatalog: SanitizerCatalog = adguardToCatalog(adguardRawData, adguardMetadata);

export const sanitize: Sanitizer = compileSanitizer(adguardCatalog);

export type { AdguardData, AdguardMetadata } from './types.js';
export { adguardMetadata, adguardRawData, adguardToCatalog };
