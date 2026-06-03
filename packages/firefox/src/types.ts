export interface FirefoxQueryStrippingRecord {
  allowList: string[];
  filter_expression?: string;
  id: string;
  last_modified: number;
  schema: number;
  stripList: string[];
}

export interface FirefoxQueryStrippingData {
  data: FirefoxQueryStrippingRecord[];
}

export interface FirefoxMetadata {
  version: string;
  hash: string;
  fetchedAt: string;
  upstream: string;
  license: string;
}
