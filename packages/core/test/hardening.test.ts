/**
 * Hostile-catalog and hostile-input cases shared with the Rust engine
 * (`crates/url-sanitize-core/tests/hardening.rs` reads the same fixture).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import type { SanitizerCatalog, SanitizerOptions } from '../src/index.js';
import { compileSanitizer } from '../src/index.js';

interface Case {
  id: string;
  input: string;
  options?: SanitizerOptions;
  expected: { kind: string; url?: string };
}

const fixture = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../crates/url-sanitize-core/tests/fixtures/hardening.json'),
    'utf8'
  )
) as { catalog: SanitizerCatalog; cases: Case[] };

const LONG = `https://a.example/?utm_source=x&q=${'a'.repeat(8200)}`;
const expand = (s: string | undefined) => (s === 'LONG' ? LONG : s);

describe('hardening fixture', () => {
  for (const c of fixture.cases) {
    it(c.id, () => {
      const result = compileSanitizer(fixture.catalog, c.options)(expand(c.input) ?? '');
      expect(result.kind).toBe(c.expected.kind);
      if (c.expected.url !== undefined && 'url' in result) {
        expect(result.url).toBe(expand(c.expected.url));
      }
    });
  }
});

describe('regex cost', () => {
  it('an unanchored `.*a.*b` URL pattern stays fast on a long URL', () => {
    const sanitize = compileSanitizer({
      version: '0.0.0-test',
      generatedAt: '2026-01-01T00:00:00Z',
      sources: [{ name: 'custom' }],
      rules: [
        {
          kind: 'strip-param',
          source: 'custom',
          provider: 'cubic',
          urlPattern: '.*z=.*&var=',
          paramPattern: 'var'
        }
      ]
    });
    const input = `https://a.example/?${'z='.repeat(4000)}`;
    const start = performance.now();
    expect(sanitize(input).kind).toBe('unchanged');
    // Before the leading `.*` was dropped this took about 30 s.
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
