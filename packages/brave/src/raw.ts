import cleanUrlsData from '../data/clean-urls.json' with { type: 'json' };
import rawData from '../data/data.json' with { type: 'json' };
import metadata from '../data/metadata.json' with { type: 'json' };
import queryFilterData from '../data/query-filter.json' with { type: 'json' };
import type { BraveDebounceData, BraveMetadata, BraveParamLists } from './types.js';

export const braveRawData: BraveDebounceData = rawData as BraveDebounceData;
export const braveMetadata: BraveMetadata = metadata as BraveMetadata;
export const braveParamLists: BraveParamLists = {
  queryFilter: queryFilterData,
  cleanUrls: cleanUrlsData
};
