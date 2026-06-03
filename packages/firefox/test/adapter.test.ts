import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vitest';
import { firefoxToCatalog } from '../src/index.js';

const metadata = {
  version: 'test',
  hash: 'hash',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  upstream: 'https://example.com/firefox.json',
  license: 'MPL-2.0'
};

describe('firefoxToCatalog', () => {
  it('adapts stripList and allowList records', () => {
    const catalog = firefoxToCatalog(
      {
        data: [
          {
            id: 'record',
            schema: 1,
            last_modified: 1,
            allowList: ['allowed.example'],
            stripList: ['fbclid']
          }
        ]
      },
      metadata
    );
    const sanitize = compileSanitizer(catalog);

    expect(sanitize('https://example.com/?fbclid=1&keep=1')).toMatchObject({
      kind: 'cleaned',
      url: 'https://example.com/?keep=1'
    });
    expect(sanitize('https://allowed.example/?fbclid=1').kind).toBe('unchanged');
  });

  it('throws on unsupported filter expressions', () => {
    expect(() =>
      firefoxToCatalog(
        {
          data: [
            {
              id: 'record',
              schema: 1,
              last_modified: 1,
              allowList: [],
              stripList: ['fbclid'],
              filter_expression: 'unsupported'
            }
          ]
        },
        metadata
      )
    ).toThrow(/Unsupported Firefox filter_expression/);
  });
});
