import { adguardCatalog } from '@url-sanitize/adguard';
import { braveCatalog } from '@url-sanitize/brave';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { firefoxCatalog } from '@url-sanitize/firefox';
import { describe, expect, it } from 'vite-plus/test';

import { mergedCatalog, mergeSources } from '../src/index.js';

describe('mergedCatalog', () => {
  it('leaves the GPL-3.0 AdGuard source out of the default', () => {
    expect(mergedCatalog.sources.map((source) => source.name)).toEqual([
      'clearurls',
      'brave',
      'firefox'
    ]);
    expect(mergedCatalog.rules.some((rule) => rule.source === 'adguard')).toBe(false);
  });

  it('takes AdGuard when it is passed in', () => {
    const withAdguard = mergeSources([
      clearurlsCatalog,
      adguardCatalog,
      braveCatalog,
      firefoxCatalog
    ]);
    expect(withAdguard.sources.map((source) => source.name)).toContain('adguard');
    expect(withAdguard.rules.some((rule) => rule.source === 'adguard')).toBe(true);
  });
});

describe('mergeSources', () => {
  it('dedupes exact semantic duplicates while preserving source priority', () => {
    const first = {
      version: 'a',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sources: [{ name: 'clearurls' as const }],
      rules: [
        {
          kind: 'strip-param' as const,
          source: 'clearurls' as const,
          provider: 'first',
          paramPattern: 'fbclid'
        }
      ]
    };
    const second = {
      version: 'b',
      generatedAt: '2026-01-02T00:00:00.000Z',
      sources: [{ name: 'firefox' as const }],
      rules: [
        {
          kind: 'strip-param' as const,
          source: 'firefox' as const,
          provider: 'second',
          paramPattern: 'fbclid'
        }
      ]
    };

    const merged = mergeSources([first, second]);

    expect(merged.generatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(merged.rules).toHaveLength(1);
    expect(merged.rules[0]?.provider).toBe('first');
  });

  it('supports empty source lists', () => {
    const merged = mergeSources([]);

    expect(merged.generatedAt).toBe('');
    expect(merged.rules).toEqual([]);
    expect(merged.sources).toEqual([]);
  });
});
