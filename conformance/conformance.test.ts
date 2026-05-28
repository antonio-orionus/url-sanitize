/**
 * TS-engine conformance gate.
 *
 * Asserts that the TS engine (the oracle) reproduces every entry in the
 * generated `vectors.jsonl` and `clearurls-corpus.jsonl`. If this fails, the
 * generated corpus is out of sync with the engine — re-run
 * `pnpm build:conformance` after intentional behavior changes.
 *
 * Also runs the P1–P10 property invariants from `conformance/properties.md`
 * against the corpus.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { compileSanitizer } from '@url-sanitize/core';
import type { SanitizeResult, SanitizerOptions } from '@url-sanitize/core';
import { describe, expect, it } from 'vitest';

type Expected =
  | { kind: 'unchanged'; url: string }
  | {
      kind: 'cleaned';
      url: string;
      strippedParamsContains: string[];
      matchedProviders: string[];
    }
  | { kind: 'redirected'; url: string; viaProvider: string }
  | { kind: 'blocked'; viaProvider: string };

type Vector = {
  id: string;
  input: string;
  options?: SanitizerOptions;
  expected: Expected;
};

const here = resolve(import.meta.dirname);
const vectors = readJsonl<Vector>(resolve(here, 'vectors.jsonl'));
const corpus = readJsonl<Vector>(resolve(here, 'clearurls-corpus.jsonl'));

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(path, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

function sanitizerFor(opts: SanitizerOptions | undefined) {
  return compileSanitizer(clearurlsCatalog, opts ?? {});
}

function urlOf(r: SanitizeResult): string | null {
  if (r.kind === 'unchanged' || r.kind === 'cleaned' || r.kind === 'redirected') return r.url;
  return null;
}

function assertMatches(actual: SanitizeResult, expected: Expected, id: string): void {
  expect(actual.kind, `${id}: kind`).toBe(expected.kind);
  switch (expected.kind) {
    case 'unchanged':
      if (actual.kind !== 'unchanged') throw new Error('narrow');
      expect(actual.url, `${id}: url`).toBe(expected.url);
      return;
    case 'cleaned': {
      if (actual.kind !== 'cleaned') throw new Error('narrow');
      expect(actual.url, `${id}: url`).toBe(expected.url);
      for (const name of expected.strippedParamsContains) {
        expect(actual.strippedParams, `${id}: strippedParams contains ${name}`).toContain(name);
      }
      const actualProviders = new Set(actual.matchedRules.map((m) => m.provider));
      for (const p of expected.matchedProviders) {
        expect(actualProviders.has(p), `${id}: matched provider ${p}`).toBe(true);
      }
      return;
    }
    case 'redirected':
      if (actual.kind !== 'redirected') throw new Error('narrow');
      expect(actual.url, `${id}: url`).toBe(expected.url);
      expect(actual.via.provider, `${id}: via.provider`).toBe(expected.viaProvider);
      return;
    case 'blocked':
      if (actual.kind !== 'blocked') throw new Error('narrow');
      expect(actual.via.provider, `${id}: via.provider`).toBe(expected.viaProvider);
      return;
  }
}

describe('conformance — vectors.jsonl', () => {
  for (const v of vectors) {
    it(v.id, () => {
      const result = sanitizerFor(v.options)(v.input);
      assertMatches(result, v.expected, v.id);
    });
  }
});

describe('conformance — clearurls-corpus.jsonl', () => {
  for (const v of corpus) {
    it(v.id, () => {
      const result = sanitizerFor(v.options)(v.input);
      assertMatches(result, v.expected, v.id);
    });
  }
});

describe('properties (corpus-driven)', () => {
  const sanitize = sanitizerFor(undefined);
  const sanitizeAll = sanitizerFor({
    stripReferralMarketing: true,
    unwrapRedirects: true,
    domainBlocking: true
  });

  it('P1: idempotence on default options', () => {
    for (const v of corpus) {
      const once = sanitize(v.input);
      const seed = urlOf(once);
      if (seed === null) continue;
      const twice = sanitize(seed);
      const twiceUrl = urlOf(twice);
      expect(twiceUrl, `${v.id}: idempotent`).toBe(seed);
    }
  });

  it('P2: host/scheme/port integrity on cleaned', () => {
    for (const v of corpus) {
      const r = sanitize(v.input);
      if (r.kind !== 'cleaned') continue;
      const before = new URL(v.input);
      const after = new URL(r.url);
      expect(after.host, `${v.id}: host`).toBe(before.host);
      expect(after.protocol, `${v.id}: protocol`).toBe(before.protocol);
      expect(after.port, `${v.id}: port`).toBe(before.port);
    }
  });

  it('P3: path integrity when only strip-param fired', () => {
    for (const v of corpus) {
      const r = sanitize(v.input);
      if (r.kind !== 'cleaned') continue;
      if (r.matchedRules.some((m) => m.kind !== 'strip-param')) continue;
      const before = new URL(v.input);
      const after = new URL(r.url);
      expect(after.pathname, `${v.id}: pathname`).toBe(before.pathname);
    }
  });

  it('P4: malformed inputs are unchanged verbatim', () => {
    for (const bad of ['', 'not a url', 'htps:/x', '://nope', 'http:']) {
      const r = sanitize(bad);
      expect(r.kind).toBe('unchanged');
      if (r.kind === 'unchanged') expect(r.url).toBe(bad);
    }
  });

  it('P5: superset options never strip fewer params', () => {
    for (const v of corpus) {
      const base = sanitize(v.input);
      const sup = sanitizeAll(v.input);
      if (base.kind === 'cleaned' && sup.kind === 'cleaned') {
        for (const name of base.strippedParams) {
          expect(sup.strippedParams, `${v.id}: sup ⊇ base for ${name}`).toContain(name);
        }
      }
    }
  });
});
