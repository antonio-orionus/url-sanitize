import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import type { ClearUrlsData, ClearUrlsMetadata } from './types.js';

export const clearurlsRawData = rawData as ClearUrlsData;
export const clearurlsMetadata = metadata as ClearUrlsMetadata;
