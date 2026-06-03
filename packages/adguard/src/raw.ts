import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import type { AdguardData, AdguardMetadata } from './types.js';

export const adguardRawData: AdguardData = rawData as AdguardData;
export const adguardMetadata: AdguardMetadata = metadata as AdguardMetadata;
