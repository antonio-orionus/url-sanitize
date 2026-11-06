import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LISTS_URL = 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists';
// Debouncer (redirect unwrapping), the navigation query filter, and the
// per-site params behind Brave's "Copy clean link".
const RULES_URL = `${LISTS_URL}/debounce.json`;
const QUERY_FILTER_URL = `${LISTS_URL}/query-filter.json`;
const CLEAN_URLS_URL = `${LISTS_URL}/clean-urls.json`;
const LICENSE = 'MPL-2.0';
const FETCH_TIMEOUT_MS = 10_000;

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../packages/brave/data');
const metadataPath = resolve(dataDir, 'metadata.json');

type ExistingMetadata = {
  hash?: unknown;
  license?: unknown;
};

/** The hash of the bundled data, or null when it must be rewritten (absent, or under another license). */
async function readExistingHash(): Promise<string | null> {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as ExistingMetadata;
    if (metadata.license !== LICENSE) return null;
    return typeof metadata.hash === 'string' ? metadata.hash.toLowerCase() : null;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  console.log(`fetching ${url}`);
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Fetch ${url} failed: ${response.status}`);
  return JSON.parse(await response.text()) as unknown;
}

/** query-filter.json and clean-urls.json: `{ include, exclude, params }` entries. */
function checkParamLists(parsed: unknown, name: string): unknown[] {
  if (!Array.isArray(parsed)) throw new Error(`Brave ${name} data must be an array`);
  for (const [index, entry] of parsed.entries()) {
    const e = entry as { include?: unknown; exclude?: unknown; params?: unknown };
    const strings = (value: unknown): boolean =>
      Array.isArray(value) && value.every((item) => typeof item === 'string');
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !strings(e.include) ||
      !strings(e.exclude) ||
      !strings(e.params)
    ) {
      throw new Error(`Brave ${name} entry ${index} has an unsupported shape`);
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const parsed = await fetchJson(RULES_URL);
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
  const queryFilter = checkParamLists(await fetchJson(QUERY_FILTER_URL), 'query-filter');
  const cleanUrls = checkParamLists(await fetchJson(CLEAN_URLS_URL), 'clean-urls');

  const files = {
    'data.json': `${JSON.stringify(normalizeBraveData(parsed), null, 2)}\n`,
    'query-filter.json': `${JSON.stringify(queryFilter, null, 2)}\n`,
    'clean-urls.json': `${JSON.stringify(cleanUrls, null, 2)}\n`
  };
  // One identity for the source: every file, in a fixed order.
  const hasher = createHash('sha256');
  for (const [name, body] of Object.entries(files)) hasher.update(`${name}\n${body}`);
  const hash = hasher.digest('hex');
  const existingHash = await readExistingHash();
  if (existingHash === hash) {
    console.log(`rules unchanged: ${hash}`);
    return;
  }

  await mkdir(dataDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(resolve(dataDir, name), body);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        version: hash.slice(0, 12),
        hash,
        fetchedAt: new Date().toISOString(),
        upstream: RULES_URL,
        upstreams: [RULES_URL, QUERY_FILTER_URL, CLEAN_URLS_URL],
        license: LICENSE
      },
      null,
      2
    )}\n`
  );
  console.log(`wrote ${Object.keys(files).join(', ')} + metadata.json to ${dataDir}`);
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
