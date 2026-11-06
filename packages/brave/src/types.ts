export type BraveDebounceAction =
  | 'redirect'
  | 'base64,redirect'
  | 'regex-path'
  | 'regex-path-template'
  | (string & {});

export interface BraveDebounceRule {
  action: BraveDebounceAction;
  exclude: string[];
  include: string[];
  param: string;
  prepend_scheme?: 'http' | 'https';
  pref?: string;
  redirect_url_template?: string;
}

export type BraveDebounceData = BraveDebounceRule[];

/** One entry of query-filter.json or clean-urls.json. */
export interface BraveParamRule {
  include: string[];
  exclude: string[];
  params: string[];
}

export type BraveParamData = BraveParamRule[];

/**
 * Brave's param lists: `queryFilter` is the query filter Brave applies on
 * navigation, `cleanUrls` the per-site params behind its "Copy clean link".
 */
export interface BraveParamLists {
  queryFilter: BraveParamData;
  cleanUrls: BraveParamData;
}

export interface BraveMetadata {
  version: string;
  hash: string;
  fetchedAt: string;
  upstream: string;
  /** Every upstream file the data comes from; `upstream` is the first. */
  upstreams?: string[];
  license: string;
}
