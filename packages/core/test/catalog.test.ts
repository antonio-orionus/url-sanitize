import { clearurlsCatalog } from '@url-sanitize/clearurls';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import type { SanitizeResult, SanitizerCatalog } from '../src/index.js';
import {
  compileSanitizer,
  defineCatalog,
  mergeCatalogs,
  sanitizeResultJsonSchema,
  sanitizerCatalogJsonSchema
} from '../src/index.js';

const customCatalog = defineCatalog({
  version: 'custom-a',
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: [{ name: 'custom', version: 'custom-a' }],
  rules: [
    {
      kind: 'strip-param',
      source: 'custom',
      provider: 'custom-global',
      paramPattern: 'utm_.+',
      exceptions: ['^https://keep\\.example/']
    }
  ]
});

const secondCatalog = defineCatalog({
  version: 'custom-b',
  generatedAt: '2026-01-02T00:00:00.000Z',
  sources: [{ name: 'custom', version: 'custom-b' }],
  rules: [
    {
      kind: 'unwrap-redirect',
      source: 'custom',
      provider: 'custom-redirect',
      urlPattern: '^https://redirect\\.example/',
      pattern: '[?&]to=([^&]+)',
      captureGroup: 1
    },
    {
      kind: 'block-domain',
      source: 'custom',
      provider: 'custom-block',
      urlPattern: '^https://blocked\\.example/'
    }
  ]
});

describe('catalog helpers', () => {
  it('mergeCatalogs preserves input order and concatenates without dedupe', () => {
    const merged = mergeCatalogs(customCatalog, secondCatalog);

    expect(merged.version).toBe('merged(custom-a,custom-b)');
    expect(merged.generatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(merged.sources.map((source) => source.version)).toEqual(['custom-a', 'custom-b']);
    expect(merged.rules.map((rule) => rule.provider)).toEqual([
      'custom-global',
      'custom-redirect',
      'custom-block'
    ]);
  });

  it('mergeCatalogs does not mutate or alias source catalogs', () => {
    const merged = mergeCatalogs(customCatalog, secondCatalog);
    const firstMergedRule = merged.rules[0];
    if (firstMergedRule?.kind !== 'strip-param') {
      throw new Error('expected first merged rule');
    }

    firstMergedRule.provider = 'changed';
    firstMergedRule.exceptions?.push('^https://changed\\.example/');

    expect(customCatalog.rules[0]?.provider).toBe('custom-global');
    expect(customCatalog.rules[0]?.exceptions).toEqual(['^https://keep\\.example/']);
  });
});

describe('JSON Schema exports', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateCatalog = ajv.compile(sanitizerCatalogJsonSchema);
  const validateResult = ajv.compile(sanitizeResultJsonSchema);

  it('catalog schema accepts the bundled ClearURLs catalog', () => {
    expect(validateCatalog(clearurlsCatalog), ajv.errorsText(validateCatalog.errors)).toBe(true);
  });

  it('catalog schema accepts custom catalog literals', () => {
    const merged = mergeCatalogs(customCatalog, secondCatalog);
    expect(validateCatalog(merged), ajv.errorsText(validateCatalog.errors)).toBe(true);
  });

  it('result schema accepts representative result variants', () => {
    const sanitize = compileSanitizer(mergeCatalogs(customCatalog, secondCatalog), {
      domainBlocking: true
    });
    const results: SanitizeResult[] = [
      sanitize('https://example.com/clean'),
      sanitize('https://example.com/?utm_source=newsletter&id=123'),
      sanitize(`https://redirect.example/?to=${encodeURIComponent('https://target.example/')}`),
      sanitize('https://blocked.example/')
    ];

    for (const result of results) {
      expect(validateResult(result), JSON.stringify(validateResult.errors, null, 2)).toBe(true);
    }
  });
});

const _typecheckCatalog: SanitizerCatalog = customCatalog;
void _typecheckCatalog;
