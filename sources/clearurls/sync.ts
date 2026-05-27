/**
 * Fetch the latest ClearURLs ruleset from the upstream CDN, verify SHA256
 * against the published hash file, and write to packages/clearurls/data/.
 *
 * Run via `pnpm sync:clearurls`. Designed for CI cron + manual dev refresh.
 *
 * Trust model: HTTPS + GitHub Pages TLS. The hash file is served from the
 * same origin as the rules, so it only proves consistency (rules ↔ hash
 * match), not provenance. A compromised upstream origin would compromise
 * both. For stricter deployments, pin a known-good hash via
 * @url-sanitize/fetch's `pinnedHash` option (v0.2+).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_URL = 'https://rules2.clearurls.xyz/data.minify.json';
const HASH_URL = 'https://rules2.clearurls.xyz/rules.minify.hash';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../packages/clearurls/data');
const metadataPath = resolve(dataDir, 'metadata.json');

type ExistingMetadata = {
  hash?: unknown;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.text();
}

async function readExistingHash(): Promise<string | null> {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as ExistingMetadata;
    return typeof metadata.hash === 'string' ? metadata.hash.toLowerCase() : null;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function main(): Promise<void> {
  console.log(`fetching ${RULES_URL}`);
  const rulesText = (await fetchText(RULES_URL)).trim();

  console.log(`fetching ${HASH_URL}`);
  const expectedHash = (await fetchText(HASH_URL)).trim().toLowerCase();

  const actualHash = createHash('sha256').update(rulesText).digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error(
      `ClearURLs rules hash mismatch.\n  expected: ${expectedHash}\n  actual:   ${actualHash}\nThe upstream CDN may have served stale hash vs rules (10min cache-control max-age). Retry in a few minutes.`
    );
  }

  const existingHash = await readExistingHash();
  if (existingHash === actualHash) {
    console.log(`rules unchanged: ${actualHash}`);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rulesText);
  } catch (err) {
    throw new Error(`Failed to parse ClearURLs JSON: ${(err as Error).message}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('providers' in parsed) ||
    typeof (parsed as { providers: unknown }).providers !== 'object'
  ) {
    throw new Error('ClearURLs JSON missing providers field');
  }

  const providerCount = Object.keys((parsed as { providers: object }).providers).length;
  console.log(`parsed ${providerCount} providers`);

  await mkdir(dataDir, { recursive: true });

  await writeFile(resolve(dataDir, 'data.json'), `${JSON.stringify(parsed, null, 2)}\n`);

  const metadata = {
    version: actualHash.slice(0, 12),
    hash: actualHash,
    fetchedAt: new Date().toISOString(),
    upstream: RULES_URL
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`wrote ${dataDir}/data.json + metadata.json`);
  console.log(`hash: ${actualHash}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
