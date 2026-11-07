/**
 * sanitizeText() edge cases that need no real catalog. The detection rules
 * themselves are pinned for both engines by `conformance/text-vectors.jsonl`.
 */
import { describe, expect, it } from 'vite-plus/test';

import type { SanitizerCatalog } from '../src/index.js';
import { compileSanitizer, sanitizeText } from '../src/index.js';
import { cpuNow } from './cpu-time.js';

const catalog: SanitizerCatalog = {
  version: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: [],
  rules: [{ kind: 'strip-param', source: 'custom', provider: 'utm', paramPattern: 'utm_source' }]
};
const sanitize = compileSanitizer(catalog);

describe('sanitizeText', () => {
  it('returns the same string when nothing changes', () => {
    const text = 'see https://example.com/a and more';
    expect(sanitizeText(text, sanitize).text).toBe(text);
  });

  it('keeps text around astral characters intact', () => {
    const text = '🙂 https://example.com/?utm_source=x 🙂';
    expect(sanitizeText(text, sanitize).text).toBe('🙂 https://example.com/ 🙂');
  });

  it('matches the scheme case-insensitively in ASCII only', () => {
    expect(sanitizeText('httpſ://example.com/?utm_source=x', sanitize).urls).toHaveLength(0);
  });

  it('stays linear on a long run of unmatched closing brackets', () => {
    const text = `https://example.com/?utm_source=x${')'.repeat(200_000)}`;
    const started = cpuNow();
    const result = sanitizeText(text, sanitize);
    expect(cpuNow() - started).toBeLessThan(500);
    expect(result.text).toBe(`https://example.com/${')'.repeat(200_000)}`);
  });

  it('stays linear on many bare schemes', () => {
    const text = 'https:// x.https://.... '.repeat(50_000);
    const started = cpuNow();
    expect(sanitizeText(text, sanitize).urls).toHaveLength(0);
    expect(cpuNow() - started).toBeLessThan(500);
  });
});
