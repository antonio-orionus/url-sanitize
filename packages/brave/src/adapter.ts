import type { SanitizerCatalog, SanitizerRule } from '@url-sanitize/core';

import type { BraveDebounceData, BraveMetadata, BraveParamData, BraveParamLists } from './types.js';

/**
 * Params Brave strips that this project treats as referral marketing, as
 * ClearURLs does: kept unless `stripReferralMarketing` is on. Amazon's `tag`
 * and `ascsubtag` are affiliate IDs; `ref`, `ref_` and `referrer` credit the
 * site that sent the visit. Matched case-insensitively.
 */
export const BRAVE_REFERRAL_MARKETING_PARAMS: readonly string[] = [
  'ascsubtag',
  'partner',
  'ref',
  'ref_',
  'referrer',
  'tag'
];

export function braveToCatalog(
  data: BraveDebounceData,
  meta: BraveMetadata,
  paramLists?: BraveParamLists
): SanitizerCatalog {
  const rules: SanitizerRule[] = [];
  let index = 0;

  for (const upstreamRule of data) {
    // The daily sync runs unattended, so an unknown pattern shape skips its
    // rule (the URL stays wrapped) instead of failing every update. An
    // unknown exclude drops the whole rule: ignoring it would widen it.
    const exceptions = upstreamRule.exclude.map(matchPatternToRegex);
    if (exceptions.includes(null)) {
      console.warn(
        `brave: skipping rule with unsupported exclude: ${upstreamRule.exclude.join(' ')}`
      );
      continue;
    }
    for (const include of upstreamRule.include) {
      const urlPattern = matchPatternToRegex(include);
      if (urlPattern === null) {
        console.warn(`brave: skipping unsupported include pattern: ${include}`);
        continue;
      }
      const base: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
        kind: 'unwrap-redirect' as const,
        source: 'brave' as const,
        provider: `brave-debounce-${index}`,
        urlPattern,
        exceptions: exceptions as string[],
        pattern: upstreamRule.param,
        captureGroup: 1
      };
      if (upstreamRule.prepend_scheme) base.prependScheme = upstreamRule.prepend_scheme;

      if (upstreamRule.action === 'redirect' || upstreamRule.action === 'base64,redirect') {
        rules.push({
          ...base,
          pattern: `[?&]${escapeRegExp(upstreamRule.param)}=([^&]+)`,
          captureGroup: 1,
          targetEncoding: upstreamRule.action === 'base64,redirect' ? 'base64' : 'percent'
        });
      } else if (upstreamRule.action === 'regex-path') {
        const pathRule: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
          ...base,
          pattern: upstreamRule.param,
          captureGroup: 1,
          matchPart: 'pathname'
        };
        if (upstreamRule.redirect_url_template) {
          pathRule.targetTemplate = upstreamRule.redirect_url_template;
        } else {
          const captureTemplate = captureGroupsTemplate(upstreamRule.param);
          if (captureTemplate) pathRule.targetTemplate = captureTemplate;
        }
        rules.push(pathRule);
      } else if (upstreamRule.action === 'regex-path-template') {
        const templateRule: Extract<SanitizerRule, { kind: 'unwrap-redirect' }> = {
          ...base,
          pattern: upstreamRule.param,
          captureGroup: 1,
          matchPart: 'pathname'
        };
        if (upstreamRule.redirect_url_template) {
          templateRule.targetTemplate = upstreamRule.redirect_url_template;
        }
        rules.push(templateRule);
      } else {
        console.warn(`brave: skipping rule with unsupported action: ${upstreamRule.action}`);
        continue;
      }
      index++;
    }
  }

  if (paramLists) {
    rules.push(...paramRules(paramLists.queryFilter, 'brave-query-filter'));
    rules.push(...paramRules(paramLists.cleanUrls, 'brave-clean-urls'));
  }

  return {
    version: meta.version,
    generatedAt: meta.fetchedAt,
    sources: [
      {
        name: 'brave',
        version: meta.version,
        hash: meta.hash,
        license: meta.license,
        upstream: meta.upstream
      }
    ],
    rules
  };
}

/**
 * One `strip-param` rule per include pattern of each entry, its params as one
 * alternation. Referral-marketing params get a rule of their own, flagged.
 */
function paramRules(data: BraveParamData, prefix: string): SanitizerRule[] {
  const rules: SanitizerRule[] = [];
  const referral = new Set(BRAVE_REFERRAL_MARKETING_PARAMS);
  for (const [entryIndex, entry] of data.entries()) {
    const exceptions = entry.exclude.map(matchPatternToRegex);
    if (exceptions.includes(null)) {
      console.warn(
        `brave: skipping ${prefix} entry with unsupported exclude: ${entry.exclude.join(' ')}`
      );
      continue;
    }
    const tracking = paramAlternation(entry.params.filter((p) => !referral.has(p.toLowerCase())));
    const referralMarketing = paramAlternation(
      entry.params.filter((p) => referral.has(p.toLowerCase()))
    );
    for (const [includeIndex, include] of entry.include.entries()) {
      const urlPattern = matchPatternToRegex(include);
      if (urlPattern === null) {
        console.warn(`brave: skipping unsupported ${prefix} include pattern: ${include}`);
        continue;
      }
      const provider = `${prefix}-${entryIndex}-${includeIndex}`;
      const scope = {
        source: 'brave' as const,
        provider,
        // `*://*/*` applies everywhere: leave it unscoped.
        ...(include === '*://*/*' ? {} : { urlPattern }),
        ...(exceptions.length > 0 ? { exceptions: exceptions as string[] } : {})
      };
      if (tracking) rules.push({ kind: 'strip-param', ...scope, paramPattern: tracking });
      if (referralMarketing) {
        rules.push({
          kind: 'strip-param',
          ...scope,
          paramPattern: referralMarketing,
          isReferralMarketing: true
        });
      }
    }
  }
  return rules;
}

/**
 * The exact names as one alternation. Engines match decoded names, so a
 * percent-encoded name (`%24deep_link`) also gets its decoded form.
 */
function paramAlternation(params: string[]): string | null {
  const names = new Set<string>();
  for (const param of params) {
    names.add(param);
    try {
      names.add(decodeURIComponent(param));
    } catch {
      // Not valid percent-encoding: the name as written is all there is.
    }
  }
  if (names.size === 0) return null;
  return [...names].sort().map(escapeRegExp).join('|');
}

/** Host characters: a host wildcard must not reach into the path or query. */
const HOST_CHARS = '[^/?#]';

/**
 * Convert a WebExtension match pattern (`scheme://host/path`) to a regex.
 * `*` as the host is any host, a leading `*.` is the domain or any subdomain,
 * and `*` in the path is anything. Replacing every `*` with `.*` let
 * `*://*.ouo.today/*` match `https://evil.com/x.ouo.today/`. Returns null
 * for a shape it doesn't know.
 */
function matchPatternToRegex(pattern: string): string | null {
  pattern = normalizedIncludePattern(pattern);
  const match = /^(\*|https?):\/\/([^/]*)(\/.*)?$/.exec(pattern);
  if (!match) return null;
  const [, scheme = '*', host = '', path = '/'] = match;
  const schemeRe = scheme === '*' ? 'https?' : scheme;
  let hostRe: string;
  if (host === '*') {
    hostRe = `${HOST_CHARS}+`;
  } else if (host.startsWith('*.')) {
    hostRe = `(?:${HOST_CHARS}+\\.)?${escapeRegExp(host.slice(2))}`;
  } else if (host.includes('*')) {
    return null;
  } else {
    hostRe = escapeRegExp(host);
  }
  const pathRe = escapeRegExp(path).replace(/\\\*/g, '.*');
  return `^${schemeRe}:\\/\\/${hostRe}${pathRe}$`;
}

function normalizedIncludePattern(pattern: string): string {
  if (pattern === '*://www.tkqlhce.com/click-') return `${pattern}*`;
  if (pattern === '*://t.lever-analytics.com/email-link?') return `${pattern}*`;
  return pattern;
}

function captureGroupsTemplate(pattern: string): string | undefined {
  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '(') continue;
    if (i > 0 && pattern[i - 1] === '\\') continue;
    if (pattern[i + 1] === '?') continue;
    count++;
  }
  if (count <= 1) return undefined;
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}
