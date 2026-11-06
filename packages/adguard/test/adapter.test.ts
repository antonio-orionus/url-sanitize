import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vite-plus/test';

import { adguardToCatalog } from '../src/index.js';

const metadata = {
  version: 'test',
  hash: 'hash',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  upstream: 'https://example.com/adguard.txt',
  license: 'LGPL-3.0-only'
};

describe('adguardToCatalog', () => {
  it('adapts generic, domain-scoped, denyallow, and value-sensitive removeparam rules', () => {
    const catalog = adguardToCatalog(
      {
        text: [
          '$removeparam=utm_source',
          '$removeparam=/^token=[A-Z]{3}/',
          '$removeparam=cid,domain=example.com|~keep.example',
          '$denyallow=excluded.example,removeparam=clickid'
        ].join('\n')
      },
      metadata
    );
    const sanitize = compileSanitizer(catalog);

    expect(sanitize('https://any.example/?utm_source=x&keep=1')).toMatchObject({
      kind: 'cleaned',
      url: 'https://any.example/?keep=1'
    });
    expect(sanitize('https://any.example/?token=AB').kind).toBe('unchanged');
    expect(sanitize('https://any.example/?token=ABC')).toMatchObject({ kind: 'cleaned' });
    expect(sanitize('https://example.com/?cid=1')).toMatchObject({ kind: 'cleaned' });
    expect(sanitize('https://keep.example/?cid=1').kind).toBe('unchanged');
    expect(sanitize('https://excluded.example/?clickid=1').kind).toBe('unchanged');
  });

  it('turns @@ allowlist lines into keep-param rules', () => {
    const catalog = adguardToCatalog(
      {
        text: [
          '$removeparam=utm_source',
          '$removeparam=utm_medium',
          '$removeparam=analytics_trace_id',
          '@@||archive.*^$removeparam',
          '@@||shop.example/authentication/$removeparam=analytics_trace_id',
          '@@$removeparam=utm_medium,domain=games.example',
          '@@||app.example^$app=some.exe,removeparam=utm_source'
        ].join('\n')
      },
      metadata
    );
    expect(catalog.rules.filter((rule) => rule.kind === 'keep-param')).toHaveLength(4);
    const sanitize = compileSanitizer(catalog);

    // Bare `$removeparam`: every param kept, on any TLD of `archive.*`.
    expect(sanitize('https://web.archive.org/x?utm_source=a&utm_medium=b').kind).toBe('unchanged');
    expect(sanitize('https://archive.ph/x?utm_source=a').kind).toBe('unchanged');
    // `||host/path`: kept under the path only.
    expect(sanitize('https://shop.example/authentication/login?analytics_trace_id=1').kind).toBe(
      'unchanged'
    );
    expect(sanitize('https://shop.example/cart?analytics_trace_id=1')).toMatchObject({
      url: 'https://shop.example/cart'
    });
    // `domain=` scope keeps only the named param.
    expect(sanitize('https://games.example/?utm_medium=a&utm_source=b')).toMatchObject({
      url: 'https://games.example/?utm_medium=a'
    });
    // Modifiers before removeparam (`$app=…,removeparam=`) are still parsed.
    expect(sanitize('https://app.example/?utm_source=a').kind).toBe('unchanged');
    // Elsewhere nothing is kept.
    expect(sanitize('https://other.example/?utm_source=a&utm_medium=b')).toMatchObject({
      url: 'https://other.example/'
    });
  });

  it('leaves strip rules on the old host patterns until they are reviewed', () => {
    // `example.*` strip rules and `||host/dir/` rules with a longer path have
    // never matched. Reviving them unreviewed changed defaults (Amazon
    // affiliate tags got stripped), so only keep rules get the fix for now.
    const sanitize = compileSanitizer(
      adguardToCatalog(
        {
          text: ['||shop.example/auth/$removeparam=source', '||amazon.*^$removeparam=tag'].join(
            '\n'
          )
        },
        metadata
      )
    );
    expect(sanitize('https://shop.example/auth/login?source=x').kind).toBe('unchanged');
    expect(sanitize('https://www.amazon.com/dp/B0?tag=affiliate-20').kind).toBe('unchanged');
  });
});
