import type { Sanitizer, SanitizerCatalog } from '@url-sanitize/core';
import { compileSanitizer } from '@url-sanitize/core';
import { firefoxToCatalog } from './adapter.js';
import { firefoxMetadata, firefoxRawData } from './raw.js';

export const firefoxCatalog: SanitizerCatalog = firefoxToCatalog(firefoxRawData, firefoxMetadata);

export const sanitize: Sanitizer = compileSanitizer(firefoxCatalog);

export type {
  FirefoxMetadata,
  FirefoxQueryStrippingData,
  FirefoxQueryStrippingRecord
} from './types.js';
export { firefoxMetadata, firefoxRawData, firefoxToCatalog };
