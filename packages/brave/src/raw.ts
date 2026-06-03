import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import type { BraveDebounceData, BraveMetadata } from './types.js';

export const braveRawData: BraveDebounceData = rawData as BraveDebounceData;
export const braveMetadata: BraveMetadata = metadata as BraveMetadata;
