import { performance } from 'node:perf_hooks';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { describe, expect, it } from 'vitest';
import { compileSanitizer } from '../src/index.js';

const CASES = 10_000;
const MAX_SANITIZE_MS = 50;

describe('fuzz — deterministic ReDoS guard', () => {
  it(`sanitizes ${CASES} generated URLs without throws or slow calls`, () => {
    const sanitize = compileSanitizer(clearurlsCatalog, {
      domainBlocking: true,
      stripReferralMarketing: true,
      unwrapRedirects: true
    });
    const rng = mulberry32(0x5eed_2026);
    let maxMs = 0;

    for (let index = 0; index < CASES; index += 1) {
      const input = randomUrl(rng, index);
      const started = performance.now();
      expect(() => sanitize(input), `fuzz input ${index}: ${input}`).not.toThrow();
      const elapsed = performance.now() - started;
      maxMs = Math.max(maxMs, elapsed);
      expect(elapsed, `fuzz input ${index}: ${input}`).toBeLessThan(MAX_SANITIZE_MS);
    }

    expect(maxMs).toBeLessThan(MAX_SANITIZE_MS);
  });
});

function randomUrl(next: () => number, index: number): string {
  const hosts = [
    'example.com',
    'www.google.com',
    'www.amazon.com',
    'facebook.com',
    'news.example',
    'redirect.example'
  ];
  const host = hosts[Math.floor(next() * hosts.length)] ?? 'example.com';
  const path = randomPath(next, index);
  const params = randomParams(next);
  const fragment = next() > 0.8 ? `#${randomParams(next)}` : '';
  return `https://${host}${path}${params ? `?${params}` : ''}${fragment}`;
}

function randomPath(next: () => number, index: number): string {
  const segments = ['article', 'product', 'search', 'a'.repeat(1 + Math.floor(next() * 64))];
  const segment = segments[Math.floor(next() * segments.length)] ?? 'article';
  return `/${segment}/${index.toString(36)}`;
}

function randomParams(next: () => number): string {
  const names = ['id', 'utm_source', 'utm_medium', 'fbclid', 'gclid', 'q', 'tag', 'ref'];
  const count = 1 + Math.floor(next() * 8);
  const pairs: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = names[Math.floor(next() * names.length)] ?? 'id';
    const value = randomValue(next);
    pairs.push(`${name}=${encodeURIComponent(value)}`);
  }
  return pairs.join('&');
}

function randomValue(next: () => number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~';
  const length = Math.floor(next() * 96);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += chars[Math.floor(next() * chars.length)] ?? 'x';
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
