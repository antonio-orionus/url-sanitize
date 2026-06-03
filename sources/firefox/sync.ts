import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_URL =
  'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/query-stripping/records';
const LICENSE = 'MPL-2.0';
const FETCH_TIMEOUT_MS = 10_000;

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../packages/firefox/data');
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
  const response = await fetchWithTimeout(RULES_URL);
  if (!response.ok) throw new Error(`Fetch ${RULES_URL} failed: ${response.status}`);
  const parsed = (await response.json()) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { data?: unknown }).data)
  ) {
    throw new Error('Firefox query-stripping response missing data array');
  }
  for (const record of (parsed as { data: Array<Record<string, unknown>> }).data) {
    if (record.filter_expression) {
      throw new Error(`Unsupported Firefox filter_expression in record ${record.id}`);
    }
  }

  const normalized = `${JSON.stringify(parsed, null, 2)}\n`;
  const hash = createHash('sha256').update(normalized).digest('hex');
  const existingHash = await readExistingHash();
  if (existingHash === hash) {
    console.log(`rules unchanged: ${hash}`);
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(resolve(dataDir, 'data.json'), normalized);
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

async function fetchWithTimeout(url: string): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error(`Fetch ${url} timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
