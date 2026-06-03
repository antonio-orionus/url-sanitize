import { describe, expect, it } from 'vitest';
import type { SanitizerCatalog } from '../src/index.js';
import { compileSanitizer } from '../src/index.js';

const miniCatalog: SanitizerCatalog = {
  version: '0.0.0-test',
  generatedAt: '2026-01-01T00:00:00Z',
  sources: [{ name: 'custom' }],
  rules: [
    {
      kind: 'strip-param',
      source: 'custom',
      provider: 'globalRules',
      paramPattern: 'utm_.+'
    },
    {
      kind: 'strip-param',
      source: 'custom',
      provider: 'amazon',
      urlPattern: '^https?://(?:www\\.)?amazon\\.',
      paramPattern: 'tag',
      isReferralMarketing: true
    },
    {
      kind: 'unwrap-redirect',
      source: 'custom',
      provider: 'google-redirect',
      urlPattern: '^https?://(?:www\\.)?google\\.com/url',
      pattern: '[?&]q=([^&]+)',
      captureGroup: 1
    },
    {
      kind: 'strip-param',
      source: 'custom',
      provider: 'value-sensitive',
      paramPattern: 'token',
      valuePattern: '[A-Z]{3}'
    },
    {
      kind: 'unwrap-redirect',
      source: 'custom',
      provider: 'base64-redirect',
      urlPattern: '^https?://b64\\.example/',
      pattern: '[?&]to=([^&]+)',
      captureGroup: 1,
      targetEncoding: 'base64'
    },
    {
      kind: 'unwrap-redirect',
      source: 'custom',
      provider: 'path-redirect',
      urlPattern: '^https?://path\\.example/',
      pattern: '^/out/(.*)$',
      captureGroup: 1,
      matchPart: 'pathname',
      prependScheme: 'https'
    },
    {
      kind: 'unwrap-redirect',
      source: 'custom',
      provider: 'template-redirect',
      urlPattern: '^https?://template\\.example/',
      pattern: '^/amp/s/([^/]+)/(.*)$',
      captureGroup: 1,
      matchPart: 'pathname',
      targetTemplate: 'https://$1/$2'
    }
  ]
};

describe('compileSanitizer', () => {
  it('returns unchanged for clean URLs', () => {
    const sanitize = compileSanitizer(miniCatalog);
    expect(sanitize('https://example.com/path')).toEqual({
      kind: 'unchanged',
      url: 'https://example.com/path'
    });
  });

  it('strips utm_* params', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const result = sanitize('https://example.com/article?utm_source=newsletter&id=123');
    expect(result.kind).toBe('cleaned');
    if (result.kind === 'cleaned') {
      expect(result.url).toBe('https://example.com/article?id=123');
      expect(result.strippedParams).toContain('utm_source');
    }
  });

  it('keeps referral marketing params by default', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const result = sanitize('https://www.amazon.com/dp/B0?tag=affiliate-20');
    expect(result.kind).toBe('unchanged');
  });

  it('strips referral marketing params when opted in', () => {
    const sanitize = compileSanitizer(miniCatalog, { stripReferralMarketing: true });
    const result = sanitize('https://www.amazon.com/dp/B0?tag=affiliate-20');
    expect(result.kind).toBe('cleaned');
    if (result.kind === 'cleaned') {
      expect(result.url).toBe('https://www.amazon.com/dp/B0');
    }
  });

  it('unwraps Google redirect URLs', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const target = 'https://example.com/target';
    const result = sanitize(`https://www.google.com/url?sa=t&q=${encodeURIComponent(target)}`);
    expect(result.kind).toBe('redirected');
    if (result.kind === 'redirected') {
      expect(result.url).toBe(target);
    }
  });

  it('returns unchanged for invalid URLs', () => {
    const sanitize = compileSanitizer(miniCatalog);
    expect(sanitize('not a url')).toEqual({ kind: 'unchanged', url: 'not a url' });
  });

  it('strips value-sensitive params only when the value matches', () => {
    const sanitize = compileSanitizer(miniCatalog);
    expect(sanitize('https://example.com/?token=AB').kind).toBe('unchanged');
    const result = sanitize('https://example.com/?token=ABC&keep=1');
    expect(result.kind).toBe('cleaned');
    if (result.kind === 'cleaned') {
      expect(result.url).toBe('https://example.com/?keep=1');
    }
  });

  it('unwraps base64 redirect targets', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const encoded = btoa('https://example.com/base64');
    const result = sanitize(`https://b64.example/?to=${encodeURIComponent(encoded)}`);
    expect(result.kind).toBe('redirected');
    if (result.kind === 'redirected') {
      expect(result.url).toBe('https://example.com/base64');
    }
  });

  it('unwraps redirect targets from pathnames with prepended schemes', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const result = sanitize('https://path.example/out/example.com/path');
    expect(result.kind).toBe('redirected');
    if (result.kind === 'redirected') {
      expect(result.url).toBe('https://example.com/path');
    }
  });

  it('keeps absolute redirect targets when prependScheme is configured', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const result = sanitize('https://path.example/out/https://example.com/path');
    expect(result.kind).toBe('redirected');
    if (result.kind === 'redirected') {
      expect(result.url).toBe('https://example.com/path');
    }
  });

  it('unwraps redirect targets with templates', () => {
    const sanitize = compileSanitizer(miniCatalog);
    const result = sanitize('https://template.example/amp/s/example.com/path/to/article');
    expect(result.kind).toBe('redirected');
    if (result.kind === 'redirected') {
      expect(result.url).toBe('https://example.com/path/to/article');
    }
  });
});
