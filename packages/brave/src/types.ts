export interface BraveDebounceRule {
  action: 'redirect' | 'base64,redirect' | 'regex-path' | 'regex-path-template';
  exclude: string[];
  include: string[];
  param: string;
  prepend_scheme?: 'http' | 'https';
  pref?: string;
  redirect_url_template?: string;
}

export type BraveDebounceData = BraveDebounceRule[];

export interface BraveMetadata {
  version: string;
  hash: string;
  fetchedAt: string;
  upstream: string;
  license: string;
}
