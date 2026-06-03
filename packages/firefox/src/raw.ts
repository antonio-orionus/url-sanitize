import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import type { FirefoxMetadata, FirefoxQueryStrippingData } from './types.js';

export const firefoxRawData: FirefoxQueryStrippingData = rawData as FirefoxQueryStrippingData;
export const firefoxMetadata: FirefoxMetadata = metadata as FirefoxMetadata;
