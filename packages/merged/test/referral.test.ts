/**
 * Brave strips some params that ClearURLs marks as referral marketing (Amazon
 * affiliate `tag`, `ref`, `referrer`), which this project keeps unless
 * `stripReferralMarketing` is on. The Brave adapter flags them from a fixed
 * list; this test fails when Brave's lists gain one the list doesn't cover.
 */
import { BRAVE_REFERRAL_MARKETING_PARAMS, braveParamLists } from '@url-sanitize/brave';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { describe, expect, it } from 'vite-plus/test';

import { sanitize } from '../src/index.js';

const clearurlsReferral = clearurlsCatalog.rules.flatMap((rule) =>
  rule.kind === 'strip-param' && rule.isReferralMarketing
    ? [new RegExp(`^(?:${rule.paramPattern})$`, 'i')]
    : []
);

describe('Brave referral-marketing params', () => {
  it('flags every Brave param that ClearURLs treats as referral marketing', () => {
    const flagged = new Set(BRAVE_REFERRAL_MARKETING_PARAMS);
    const params = [...braveParamLists.queryFilter, ...braveParamLists.cleanUrls].flatMap(
      (entry) => entry.params
    );
    const missing = params.filter(
      (param) => !flagged.has(param.toLowerCase()) && clearurlsReferral.some((re) => re.test(param))
    );
    expect([...new Set(missing)]).toEqual([]);
  });

  it('keeps an Amazon affiliate tag by default', () => {
    expect(sanitize('https://www.amazon.de/dp/B000000000?tag=affiliate-21').kind).toBe('unchanged');
  });
});
