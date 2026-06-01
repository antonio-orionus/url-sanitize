import { performance } from 'node:perf_hooks';
import { clearurlsCatalog, clearurlsMetadata } from '@url-sanitize/clearurls';
import { compileSanitizer } from '@url-sanitize/core';

const iterations = 50_000;
const urls = [
  'https://example.com/article?utm_source=newsletter&utm_medium=email&id=123',
  'https://www.google.com/url?q=https%3A%2F%2Fexample.org%2Ftarget&sa=t',
  'https://www.amazon.com/dp/B000000?tag=affiliate-20&psc=1',
  'https://news.example/story?fbclid=abc123&gclid=def456&id=42',
  'https://example.com/path#utm_source=fragment&id=ok'
];

const sanitize = compileSanitizer(clearurlsCatalog, {
  stripReferralMarketing: true,
  unwrapRedirects: true,
  domainBlocking: true
});

for (let index = 0; index < 5_000; index += 1) {
  sanitize(urls[index % urls.length] ?? urls[0]);
}

const durations: number[] = [];
const started = performance.now();

for (let index = 0; index < iterations; index += 1) {
  const input = urls[index % urls.length] ?? urls[0];
  const callStarted = performance.now();
  sanitize(input);
  durations.push(performance.now() - callStarted);
}

const elapsedMs = performance.now() - started;
durations.sort((a, b) => a - b);

const summary = {
  catalogHash: clearurlsMetadata.hash,
  catalogRules: clearurlsCatalog.rules.length,
  iterations,
  totalMs: round(elapsedMs),
  opsPerSecond: Math.round(iterations / (elapsedMs / 1000)),
  p50Ms: percentile(durations, 0.5),
  p95Ms: percentile(durations, 0.95),
  maxMs: round(durations.at(-1) ?? 0)
};

console.log(JSON.stringify(summary, null, 2));

function percentile(values: number[], p: number): number {
  const index = Math.min(values.length - 1, Math.floor(values.length * p));
  return round(values[index] ?? 0);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
