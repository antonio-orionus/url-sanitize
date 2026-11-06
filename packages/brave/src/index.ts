import type { Sanitizer, SanitizerCatalog } from '@url-sanitize/core';
import { compileSanitizer } from '@url-sanitize/core';

import { BRAVE_REFERRAL_MARKETING_PARAMS, braveToCatalog } from './adapter.js';
import { braveMetadata, braveParamLists, braveRawData } from './raw.js';

export const braveCatalog: SanitizerCatalog = braveToCatalog(
  braveRawData,
  braveMetadata,
  braveParamLists
);

export const sanitize: Sanitizer = compileSanitizer(braveCatalog);

export type {
  BraveDebounceData,
  BraveDebounceRule,
  BraveMetadata,
  BraveParamData,
  BraveParamLists,
  BraveParamRule
} from './types.js';
export {
  BRAVE_REFERRAL_MARKETING_PARAMS,
  braveMetadata,
  braveParamLists,
  braveRawData,
  braveToCatalog
};
