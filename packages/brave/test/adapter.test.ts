import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vitest';
import { braveToCatalog } from '../src/index.js';

const metadata = {
  version: 'test',
  hash: 'hash',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  upstream: 'https://example.com/debounce.json',
  license: 'MPL-2.0'
};

describe('braveToCatalog', () => {
  it('adapts redirect, base64 redirect, regex-path, and template rules', () => {
    const catalog = braveToCatalog(
      [
        {
          include: ['*://go.example/*'],
          exclude: [],
          action: 'redirect',
          param: 'url'
        },
        {
          include: ['*://t.lever-analytics.com/email-link?'],
          exclude: [],
          action: 'redirect',
          param: 'dest'
        },
        {
          include: ['*://b64.example/*'],
          exclude: [],
          action: 'base64,redirect',
          param: 'to'
        },
        {
          include: ['*://path.example/*'],
          exclude: [],
          prepend_scheme: 'https',
          action: 'regex-path',
          param: '^/out/(.*)$'
        },
        {
          include: ['*://template.example/*'],
          exclude: [],
          action: 'regex-path-template',
          param: '^/amp/s/([^/]+)/(.*)$',
          redirect_url_template: 'https://$1/$2'
        },
        {
          include: ['*://multi.example/*'],
          exclude: [],
          prepend_scheme: 'https',
          action: 'regex-path',
          param: '^/([^/]+)/s(/.*)$'
        }
      ],
      metadata
    );
    const sanitize = compileSanitizer(catalog);

    expect(sanitize('https://go.example/?url=https%3A%2F%2Ftarget.example%2F')).toMatchObject({
      kind: 'redirected',
      url: 'https://target.example/'
    });
    expect(
      sanitize('https://t.lever-analytics.com/email-link?dest=https%3A%2F%2Ftarget.example%2F')
    ).toMatchObject({
      kind: 'redirected',
      url: 'https://target.example/'
    });
    expect(
      sanitize(`https://b64.example/?to=${encodeURIComponent(btoa('https://target.example/b64'))}`)
    ).toMatchObject({ kind: 'redirected', url: 'https://target.example/b64' });
    expect(sanitize('https://path.example/out/target.example/path')).toMatchObject({
      kind: 'redirected',
      url: 'https://target.example/path'
    });
    expect(sanitize('https://template.example/amp/s/target.example/a/b')).toMatchObject({
      kind: 'redirected',
      url: 'https://target.example/a/b'
    });
    expect(sanitize('https://multi.example/example.com/s/article')).toMatchObject({
      kind: 'redirected',
      url: 'https://example.com/article'
    });
    expect(sanitize('ftp://go.example/?url=https%3A%2F%2Ftarget.example%2F').kind).toBe(
      'unchanged'
    );
  });

  it('throws on unsupported actions', () => {
    expect(() =>
      braveToCatalog(
        [
          {
            include: ['*://unknown.example/*'],
            exclude: [],
            action: 'future-action',
            param: 'target'
          }
        ],
        metadata
      )
    ).toThrow(/Unsupported Brave debounce action/);
  });
});
