export interface ClearUrlsProvider {
  urlPattern: string;
  completeProvider?: boolean;
  forceRedirection?: boolean;
  rules?: string[];
  rawRules?: string[];
  referralMarketing?: string[];
  redirections?: string[];
  exceptions?: string[];
}

export interface ClearUrlsData {
  providers: Record<string, ClearUrlsProvider>;
}

export interface ClearUrlsMetadata {
  version: string;
  hash: string;
  fetchedAt: string;
  upstream: string;
}
