import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vitest';
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
});
