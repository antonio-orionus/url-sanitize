import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_URL =
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_17_TrackParam/filter.txt';
const LICENSE = 'LGPL-3.0-only';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../packages/adguard/data');
const metadataPath = resolve(dataDir, 'metadata.json');

type ExistingMetadata = {
  hash?: unknown;
};

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
  const response = await fetch(RULES_URL);
  if (!response.ok) throw new Error(`Fetch ${RULES_URL} failed: ${response.status}`);
  const text = await response.text();
  if (!text.includes('$removeparam')) {
    throw new Error('AdGuard URL Tracking Protection filter missing $removeparam rules');
  }

  const hash = createHash('sha256').update(text).digest('hex');
  const existingHash = await readExistingHash();
  if (existingHash === hash) {
    console.log(`rules unchanged: ${hash}`);
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(resolve(dataDir, 'data.json'), `${JSON.stringify({ text }, null, 2)}\n`);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        version: hash.slice(0, 12),
        hash,
        fetchedAt: new Date().toISOString(),
        upstream: RULES_URL,
        license: LICENSE
      },
      null,
      2
    )}\n`
  );
  console.log(`wrote ${dataDir}/data.json + metadata.json`);
  console.log(`hash: ${hash}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
