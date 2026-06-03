import { describe, expect, it } from 'vitest';
import { mergeSources } from '../src/index.js';

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
});
