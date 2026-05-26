export type RuleSource = 'clearurls' | 'adguard' | 'brave' | 'firefox' | 'custom';

export type SanitizerRule =
  | {
      kind: 'strip-param';
      source: RuleSource;
      provider: string;
      urlPattern?: string;
      paramPattern: string;
      exceptions?: string[];
      isReferralMarketing?: boolean;
    }
  | {
      kind: 'raw-replace';
      source: RuleSource;
      provider: string;
      urlPattern?: string;
      pattern: string;
      replacement: string;
      exceptions?: string[];
    }
  | {
      kind: 'unwrap-redirect';
      source: RuleSource;
      provider: string;
      urlPattern?: string;
      pattern: string;
      captureGroup: number;
      exceptions?: string[];
    }
  | {
      kind: 'block-domain';
      source: RuleSource;
      provider: string;
      urlPattern: string;
      exceptions?: string[];
    };

export interface SanitizerCatalog {
  version: string;
  generatedAt: string;
  sources: Array<{
    name: RuleSource;
    version?: string;
    hash?: string;
    license?: string;
    upstream?: string;
  }>;
  rules: SanitizerRule[];
}

export interface MatchedRule {
  source: RuleSource;
  provider: string;
  kind: SanitizerRule['kind'];
  detail?: string;
}

export type SanitizeResult =
  | { kind: 'unchanged'; url: string }
  | {
      kind: 'cleaned';
      original: string;
      url: string;
      strippedParams: string[];
      matchedRules: MatchedRule[];
    }
  | {
      kind: 'redirected';
      original: string;
      url: string;
      via: MatchedRule;
    }
  | {
      kind: 'blocked';
      original: string;
      via: MatchedRule;
    };

export interface SanitizerOptions {
  stripReferralMarketing?: boolean;
  unwrapRedirects?: boolean;
  domainBlocking?: boolean;
}
