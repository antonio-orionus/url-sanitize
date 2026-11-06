/**
 * ReDoS guard for the shipped default catalog. `packages/core/test/fuzz.test.ts`
 * covers ClearURLs alone; this file adds AdGuard, Brave and Firefox. It lives
 * here because `merged` depends on `core`, so `core` can't declare the reverse.
 *
 * Random URLs never hit the inputs that make a pattern slow (AdGuard's
 * `.*z=.*&var=` needs `z=z=z=…`), so each pattern is also fed URLs built from
 * its own literals.
 */
import { performance } from 'node:perf_hooks';

import { compileSanitizer, type SanitizerOptions, type SanitizerRule } from '@url-sanitize/core';
import { describe, expect, it } from 'vite-plus/test';

import { mergedCatalog } from '../src/index.js';

const OPTIONS: SanitizerOptions = {
  domainBlocking: true,
  stripReferralMarketing: true,
  unwrapRedirects: true
};

/** Random URLs, at the ClearURLs fuzz test's budget. Each costs about 0.5 ms here. */
const RANDOM_CASES = 2_000;
const MAX_RANDOM_MS = 50;

/**
 * One rule on a hostile 8 KB URL. The worst real pattern takes about 40 ms
 * (quadratic `.*?\?.*=(.*)`); an undefended cubic one takes about 38 s.
 */
const MAX_PROBE_MS = 250;

/**
 * The whole catalog on an 8 KB URL. Every strip-param rule tests every param
 * (split and decoded once per URL), so 4000 params cost about 15 ms warm and
 * 40 ms on the first call; a super-linear regression costs far more.
 */
const MAX_FLOOD_MS = 200;

/** Under the engine's 8192-character cap, so the rules actually run. */
const HOSTILE_LENGTH = 8000;

describe('merged catalog fuzz', () => {
  const sanitize = compileSanitizer(mergedCatalog, OPTIONS);

  it(`sanitizes ${RANDOM_CASES} generated URLs without throws or slow calls`, () => {
    const rng = mulberry32(0x5eed_2026);
    const vocabulary = catalogVocabulary(mergedCatalog.rules);
    const inputs = Array.from({ length: RANDOM_CASES }, (_, index) =>
      randomUrl(rng, index, vocabulary)
    );
    // V8 compiles each regex on first use and tiers up hot code: the first
    // calls take about 25 ms here, not the inputs' fault.
    for (const input of inputs.slice(0, 100)) sanitize(input);
    const worst = slowestCall(sanitize, inputs, MAX_RANDOM_MS);
    expect(worst.ms, worst.label).toBeLessThan(MAX_RANDOM_MS);
  }, 30_000);

  it('runs every pattern on URLs built from its own literals', () => {
    const probes = hostileProbes(mergedCatalog.rules);
    expect(probes.length).toBeGreaterThan(1000);
    let worst: Timing = { ms: 0, label: '' };
    for (const probe of probes) {
      const single = compileSanitizer(
        { version: 'probe', generatedAt: '', sources: [], rules: [probe.rule] },
        OPTIONS
      );
      const timing = slowestCall(single, probe.inputs, MAX_PROBE_MS, probe.label);
      if (timing.ms > worst.ms) worst = timing;
      if (worst.ms >= MAX_PROBE_MS) break;
    }
    expect(worst.ms, worst.label).toBeLessThan(MAX_PROBE_MS);
  }, 60_000);

  it('stays linear on URLs that are all params', () => {
    const inputs = [
      fill('https://example.com/?', 'a&'),
      fill('https://example.com/?', '%3A%3F&'),
      fill('https://www.amazon.com/?', 'tag&'),
      fill('https://example.com/?', 'utm_source=x&'),
      fill('https://example.com/?q=1#', 'fbclid&')
    ];
    const worst = slowestCall(sanitize, inputs, MAX_FLOOD_MS);
    expect(worst.ms, worst.label).toBeLessThan(MAX_FLOOD_MS);
  }, 30_000);
});

interface Timing {
  ms: number;
  label: string;
}

/**
 * The slowest call over `inputs`, stopping at the first one over `budget` so a
 * cubic pattern fails in seconds, not minutes. A throw is rethrown with its input.
 */
function slowestCall(
  run: (input: string) => unknown,
  inputs: string[],
  budget: number,
  label = 'fuzz'
): Timing {
  let worst: Timing = { ms: 0, label: '' };
  for (const [index, input] of inputs.entries()) {
    const describeInput = `${label} input ${index}: ${input.slice(0, 120)}… (${input.length} chars)`;
    const started = performance.now();
    try {
      run(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${describeInput}: ${message}`);
    }
    const ms = performance.now() - started;
    if (ms > worst.ms) worst = { ms, label: describeInput };
    if (ms >= budget) break;
  }
  return worst;
}

// --- hostile inputs -------------------------------------------------------

interface Probe {
  label: string;
  rule: SanitizerRule;
  inputs: string[];
}

/**
 * One probe per distinct rule (exceptions split off) and one per distinct
 * exception, each with inputs made by repeating the pattern's literals.
 */
function hostileProbes(rules: SanitizerRule[]): Probe[] {
  const probes = new Map<string, Probe>();
  const add = (label: string, rule: SanitizerRule, patterns: (string | undefined)[]) => {
    const { provider: _provider, source: _source, ...semantic } = rule;
    const key = JSON.stringify(semantic);
    if (probes.has(key)) return;
    const present = patterns.filter((p): p is string => p !== undefined);
    const valuePattern = 'valuePattern' in rule ? rule.valuePattern : undefined;
    probes.set(key, { label, rule, inputs: hostileInputs(present, valuePattern) });
  };

  for (const rule of rules) {
    const { exceptions, ...bare } = rule;
    const label = `${rule.source}/${rule.provider} (${rule.kind})`;
    switch (bare.kind) {
      case 'strip-param':
        add(label, bare, [bare.urlPattern, bare.paramPattern]);
        break;
      case 'keep-param':
        add(label, bare, [bare.urlPattern, bare.paramPattern]);
        break;
      case 'raw-replace':
      case 'unwrap-redirect':
        add(label, bare, [bare.urlPattern, bare.pattern]);
        break;
      case 'block-domain':
        add(label, bare, [bare.urlPattern]);
        break;
    }
    // A block-domain rule that matches everything tests each exception with
    // its real flags.
    for (const exception of exceptions ?? []) {
      add(
        `${label} exception ${exception}`,
        {
          kind: 'block-domain',
          source: rule.source,
          provider: rule.provider,
          urlPattern: '^',
          exceptions: [exception]
        },
        [exception]
      );
    }
  }
  return [...probes.values()];
}

/**
 * The rule's host (so its URL pattern matches) followed by each literal run,
 * by all runs but the last (`.*z=.*&var=` → `z=z=z=…`) and by all runs,
 * repeated to fill the URL.
 */
function hostileInputs(patterns: string[], valuePattern: string | undefined): string[] {
  const host = patterns.map(firstHost).find(Boolean) ?? 'example.com';
  const inputs = new Set<string>();
  for (const pattern of patterns) {
    const runs = literalRuns(pattern);
    const units = [...runs];
    if (runs.length > 1) units.push(runs.slice(0, -1).join(''), runs.join(''));
    for (const unit of units) inputs.add(fill(`https://${host}/?`, unit));
  }
  // A value pattern only ever sees one param's value.
  for (const unit of valuePattern ? literalRuns(valuePattern) : []) {
    inputs.add(fill(`https://${host}/?x=`, unit));
  }
  return [...inputs];
}

/** `prefix` + `unit` repeated up to HOSTILE_LENGTH characters. */
function fill(prefix: string, unit: string): string {
  const count = Math.max(0, Math.floor((HOSTILE_LENGTH - prefix.length) / unit.length));
  return prefix + unit.repeat(count);
}

/**
 * The literal stretches of a regex source: `^https?:\/\/a\.com\/x.*y=` gives
 * `http`, `://a.com/x` and `y=`. Character classes and escapes like `\d`
 * break a run.
 */
function literalRuns(pattern: string): string[] {
  const runs: string[] = [];
  let run = '';
  const flush = () => {
    if (run) runs.push(run);
    run = '';
  };
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? '';
    if (char === '\\') {
      const next = pattern[index + 1] ?? '';
      index += 1;
      if (/[./?=&\-_:#%+]/.test(next)) run += next;
      else flush();
    } else if (char === '[') {
      flush();
      while (index < pattern.length && pattern[index] !== ']') {
        if (pattern[index] === '\\') index += 1;
        index += 1;
      }
    } else if (char === '{') {
      flush();
      while (index < pattern.length && pattern[index] !== '}') index += 1;
    } else if (/[A-Za-z0-9=&/_\-%~:]/.test(char)) {
      run += char;
    } else {
      flush();
    }
  }
  flush();
  return [...new Set(runs)];
}

function firstHost(pattern: string): string | undefined {
  return pattern
    .match(/[a-z0-9-]+(?:\\\.[a-z0-9-]+)+/i)?.[0]
    ?.replaceAll('\\', '')
    .toLowerCase();
}

// --- random URLs ----------------------------------------------------------

interface Vocabulary {
  hosts: string[];
  params: string[];
}

/** Hosts and plain param names from the catalog, so source rules actually fire. */
function catalogVocabulary(rules: SanitizerRule[]): Vocabulary {
  const hosts = new Set(['example.com', 'www.google.com', 'www.amazon.com', 'facebook.com']);
  const params = new Set(['id', 'q', 'u', 'url', 'utm_source', 'fbclid', 'gclid', 'ref']);
  for (const rule of rules) {
    const host = rule.urlPattern ? firstHost(rule.urlPattern) : undefined;
    if (host) hosts.add(host);
    if ('paramPattern' in rule && rule.paramPattern && /^[\w-]+$/.test(rule.paramPattern)) {
      params.add(rule.paramPattern);
    }
  }
  return { hosts: [...hosts].sort(), params: [...params].sort() };
}

function randomUrl(next: () => number, index: number, vocabulary: Vocabulary): string {
  const host = pick(next, vocabulary.hosts);
  const path = randomPath(next, index);
  const params = randomParams(next, vocabulary.params);
  const fragment = next() > 0.8 ? `#${randomParams(next, vocabulary.params)}` : '';
  return `https://${host}${path}${params ? `?${params}` : ''}${fragment}`;
}

function randomPath(next: () => number, index: number): string {
  const segments = [
    'article',
    'product',
    'search',
    'url',
    'c',
    'a'.repeat(1 + Math.floor(next() * 64))
  ];
  return `/${pick(next, segments)}/${index.toString(36)}`;
}

function randomParams(next: () => number, names: string[]): string {
  const count = 1 + Math.floor(next() * 8);
  const pairs: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const value =
      next() > 0.9
        ? `https://${pick(next, ['example.org', 'www.amazon.com'])}/?utm_source=${randomValue(next)}`
        : randomValue(next);
    pairs.push(`${pick(next, names)}=${encodeURIComponent(value)}`);
  }
  return pairs.join('&');
}

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~'.split('');

function randomValue(next: () => number): string {
  const length = Math.floor(next() * 96);
  let out = '';
  for (let index = 0; index < length; index += 1) out += pick(next, CHARS);
  return out;
}

function pick(next: () => number, items: string[]): string {
  return items[Math.floor(next() * items.length)] ?? items[0] ?? '';
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
