import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_URL =
  'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/debounce.json';
const LICENSE = 'MPL-2.0';
const FETCH_TIMEOUT_MS = 10_000;

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../packages/brave/data');
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
  const text = await response.text();
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Brave debounce data must be an array');
  for (const [index, rule] of parsed.entries()) {
    if (
      typeof rule !== 'object' ||
      rule === null ||
      !Array.isArray((rule as { include?: unknown }).include) ||
      !Array.isArray((rule as { exclude?: unknown }).exclude) ||
      typeof (rule as { action?: unknown }).action !== 'string' ||
      typeof (rule as { param?: unknown }).param !== 'string'
    ) {
      throw new Error(`Brave debounce rule ${index} has an unsupported shape`);
    }
  }

  const normalizedData = normalizeBraveData(parsed);
  const normalized = `${JSON.stringify(normalizedData, null, 2)}\n`;
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

function normalizeBraveData(parsed: unknown[]): unknown[] {
  return parsed.map((rule) => {
    if (typeof rule !== 'object' || rule === null) return rule;
    const normalized: Record<string, unknown> = { ...(rule as Record<string, unknown>) };
    if (Array.isArray(normalized.include)) {
      normalized.include = normalized.include.map((pattern) => {
        if (pattern === '*://www.tkqlhce.com/click-') return '*://www.tkqlhce.com/click-*';
        if (pattern === '*://t.lever-analytics.com/email-link?') {
          return '*://t.lever-analytics.com/email-link?*';
        }
        return pattern;
      });
    }
    if (
      normalized.action === 'regex-path' &&
      normalized.param === '^/([^/]+)/s(/.*)$' &&
      !normalized.redirect_url_template
    ) {
      normalized.redirect_url_template = '$1$2';
    }
    return normalized;
  });
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
