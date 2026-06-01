#!/usr/bin/env node
import { expectedReleaseAssets } from './release-platforms.mjs';

const version = process.argv[2]?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node scripts/verify-published-release.mjs <version>');
  process.exit(1);
}

const tag = `v${version}`;
const repo = process.env.GITHUB_REPOSITORY || 'antonio-orionus/url-sanitize';
const homebrewTap = process.env.HOMEBREW_TAP_REPO || 'antonio-orionus/homebrew-url-sanitize';
const scoopBucket = process.env.SCOOP_BUCKET_REPO || 'antonio-orionus/scoop-url-sanitize';
const attempts = Number.parseInt(process.env.RELEASE_SMOKE_ATTEMPTS || '20', 10);
const delayMs = Number.parseInt(process.env.RELEASE_SMOKE_DELAY_MS || '30000', 10);
const checks = [];

await checkJson(
  `https://registry.npmjs.org/@url-sanitize%2fcore/${version}`,
  'npm @url-sanitize/core',
  (json) => json.version === version
);
await checkJson(
  `https://registry.npmjs.org/@url-sanitize%2fclearurls/${version}`,
  'npm @url-sanitize/clearurls',
  (json) => json.version === version
);
await checkJson(
  `https://registry.npmjs.org/@url-sanitize%2fcli/${version}`,
  'npm @url-sanitize/cli',
  (json) => json.version === version
);
await checkJson(
  `https://registry.npmjs.org/@url-sanitize%2ffetch/${version}`,
  'npm @url-sanitize/fetch',
  (json) => json.version === version
);
await checkJson(
  `https://crates.io/api/v1/crates/url-sanitize-core/${version}`,
  'crates.io url-sanitize-core',
  (json) => json.version?.num === version
);
await checkJson(
  `https://crates.io/api/v1/crates/url-sanitize/${version}`,
  'crates.io url-sanitize',
  (json) => json.version?.num === version
);
await checkJson(
  `https://pypi.org/pypi/url-sanitize/${version}/json`,
  'PyPI url-sanitize',
  (json) => json.info?.version === version
);

const sumsText = await checkText(
  `https://github.com/${repo}/releases/download/${tag}/SHA256SUMS`,
  'GitHub Release SHA256SUMS'
);
for (const asset of [
  ...expectedReleaseAssets(),
  'url-sanitize-installer.sh',
  'url-sanitize-installer.ps1'
]) {
  if (!sumsText.includes(`  ${asset}`)) {
    fail(`GitHub Release SHA256SUMS`, `missing ${asset}`);
  }
}

const formula = await checkText(
  `https://raw.githubusercontent.com/${homebrewTap}/main/Formula/url-sanitize.rb`,
  'Homebrew tap formula'
);
if (
  !formula.includes(`version "${version}"`) ||
  !formula.includes(`/download/v#{version}/url-sanitize-`)
) {
  fail('Homebrew tap formula', `formula does not reference ${version}`);
}

const scoop = await checkJson(
  `https://raw.githubusercontent.com/${scoopBucket}/main/url-sanitize.json`,
  'Scoop bucket manifest',
  (json) => {
    return (
      json.version === version && json.architecture?.['64bit']?.url?.includes(`/download/${tag}/`)
    );
  }
);

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    `## Release ${tag} public smoke`,
    '',
    '| Surface | Status |',
    '| --- | --- |',
    ...checks.map((check) => `| ${check} | ok |`)
  ].join('\n');
  await import('node:fs').then(({ appendFileSync }) =>
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  );
}

console.log(`published release verification passed for ${tag}`);
void scoop;

async function checkJson(url, label, predicate) {
  return retry(label, async () => {
    const response = await fetch(url, { headers: { 'user-agent': 'url-sanitize-release-smoke' } });
    if (!response.ok) {
      fail(label, `${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    if (!predicate(json)) {
      fail(label, 'unexpected response payload');
    }
    checks.push(label);
    return json;
  });
}

async function checkText(url, label) {
  return retry(label, async () => {
    const response = await fetch(url, { headers: { 'user-agent': 'url-sanitize-release-smoke' } });
    if (!response.ok) {
      fail(label, `${response.status} ${response.statusText}`);
    }
    checks.push(label);
    return response.text();
  });
}

async function retry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      console.log(`${label} not ready (${error.message}); retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function fail(label, reason) {
  throw new Error(`${label} failed: ${reason}`);
}
