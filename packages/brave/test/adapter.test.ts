import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vite-plus/test';

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

  // The daily sync runs unattended: an unknown upstream shape must skip its
  // rule, not fail every update.
  it('skips rules with unsupported actions', () => {
    const catalog = braveToCatalog(
      [
        {
          include: ['*://unknown.example/*'],
          exclude: [],
          action: 'future-action',
          param: 'target'
        },
        { include: ['*://go.example/*'], exclude: [], action: 'redirect', param: 'url' }
      ],
      metadata
    );
    expect(catalog.rules.map((rule) => rule.urlPattern)).toEqual([
      '^https?:\\/\\/go\\.example/.*$'
    ]);
  });

  it('skips an unsupported include pattern and keeps the rest of the rule', () => {
    const catalog = braveToCatalog(
      [
        {
          include: ['<all_urls>', '*://go.example/*', '*://go*.example/*'],
          exclude: [],
          action: 'redirect',
          param: 'url'
        }
      ],
      metadata
    );
    expect(catalog.rules).toHaveLength(1);
  });

  it('drops the whole rule when an exclude pattern is unsupported', () => {
    const catalog = braveToCatalog(
      [
        { include: ['*://go.example/*'], exclude: ['<all_urls>'], action: 'redirect', param: 'url' }
      ],
      metadata
    );
    expect(catalog.rules).toHaveLength(0);
  });

  it('keeps a host wildcard inside the host', () => {
    const sanitize = compileSanitizer(
      braveToCatalog(
        [{ include: ['*://*.ouo.today/*'], exclude: [], action: 'redirect', param: 'url' }],
        metadata
      )
    );
    const target = encodeURIComponent('https://dest.example/');
    expect(sanitize(`https://x.ouo.today/?url=${target}`).kind).toBe('redirected');
    expect(sanitize(`https://ouo.today/?url=${target}`).kind).toBe('redirected');
    // `*.ouo.today` used to become `.*\.ouo\.today`, which matched in the path.
    expect(sanitize(`https://evil.example/x.ouo.today/?url=${target}`).kind).toBe('unchanged');
  });
});

describe('braveToCatalog param lists', () => {
  const meta = {
    version: 'test',
    hash: 'test',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    upstream: 'https://example.test/debounce.json',
    license: 'MPL-2.0'
  };
  const catalog = braveToCatalog([], meta, {
    queryFilter: [{ include: ['*://*/*'], exclude: [], params: ['bsft_clkid', '%24deep_link'] }],
    cleanUrls: [
      {
        include: ['*://*.shop.test/*'],
        exclude: ['*://help.shop.test/*'],
        params: ['spm', 'tag']
      }
    ]
  });
  const sanitize = compileSanitizer(catalog);

  it('strips query-filter params everywhere, matching decoded names', () => {
    expect(sanitize('https://a.test/?bsft_clkid=1&%24deep_link=x&id=2')).toMatchObject({
      kind: 'cleaned',
      url: 'https://a.test/?id=2'
    });
  });

  it('scopes clean-urls params to their sites and honors excludes', () => {
    expect(sanitize('https://www.shop.test/item?spm=1&id=2')).toMatchObject({
      kind: 'cleaned',
      url: 'https://www.shop.test/item?id=2'
    });
    expect(sanitize('https://other.test/item?spm=1').kind).toBe('unchanged');
    expect(sanitize('https://help.shop.test/item?spm=1').kind).toBe('unchanged');
  });

  it('keeps referral-marketing params unless stripReferralMarketing is on', () => {
    expect(sanitize('https://www.shop.test/item?tag=aff-21').kind).toBe('unchanged');
    expect(
      compileSanitizer(catalog, { stripReferralMarketing: true })(
        'https://www.shop.test/item?tag=aff-21'
      )
    ).toMatchObject({ kind: 'cleaned', url: 'https://www.shop.test/item' });
  });
});
