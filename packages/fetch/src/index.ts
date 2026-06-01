import { clearurlsToCatalog } from '@url-sanitize/clearurls/adapter';
import type { ClearUrlsData, ClearUrlsMetadata } from '@url-sanitize/clearurls/types';
import type { SanitizerCatalog } from '@url-sanitize/core';

export const DEFAULT_CLEARURLS_RULES_URL = 'https://rules2.clearurls.xyz/data.minify.json';
export const DEFAULT_CLEARURLS_HASH_URL = 'https://rules2.clearurls.xyz/rules.minify.hash';

export interface FetchClearurlsCatalogOptions {
  pinnedHash?: string;
  rulesUrl?: string;
  hashUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface FetchClearurlsCatalogResult {
  catalog: SanitizerCatalog;
  metadata: ClearUrlsMetadata;
  raw: ClearUrlsData;
}

export async function fetchClearurlsCatalog(
  options: FetchClearurlsCatalogOptions = {}
): Promise<FetchClearurlsCatalogResult> {
  const rulesUrl = options.rulesUrl ?? DEFAULT_CLEARURLS_RULES_URL;
  const hashUrl = options.hashUrl ?? DEFAULT_CLEARURLS_HASH_URL;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error('fetchClearurlsCatalog requires a fetch implementation');
  }

  const [rulesTextRaw, expectedHashRaw] = await Promise.all([
    fetchText(fetchImpl, rulesUrl),
    fetchText(fetchImpl, hashUrl)
  ]);
  const rulesText = rulesTextRaw.trim();
  const expectedHash = normalizeSha256(expectedHashRaw, 'published hash');
  const actualHash = await sha256Hex(rulesText);

  if (actualHash !== expectedHash) {
    throw new Error(`ClearURLs rules hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  }

  if (options.pinnedHash) {
    const pinnedHash = normalizeSha256(options.pinnedHash, 'pinned hash');
    if (actualHash !== pinnedHash) {
      throw new Error(`ClearURLs pinned hash mismatch: expected ${pinnedHash}, got ${actualHash}`);
    }
  }

  const raw = parseClearurlsData(rulesText);
  const metadata: ClearUrlsMetadata = {
    version: actualHash.slice(0, 12),
    hash: actualHash,
    fetchedAt: new Date().toISOString(),
    upstream: rulesUrl
  };

  return {
    catalog: clearurlsToCatalog(raw, metadata),
    metadata,
    raw
  };
}

async function fetchText(fetchImpl: typeof globalThis.fetch, url: string): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Fetch ${url} failed: ${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function normalizeSha256(hash: string, label: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid ${label}: expected 64 lowercase hex characters`);
  }
  return normalized;
}

function parseClearurlsData(text: string): ClearUrlsData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse ClearURLs JSON: ${(error as Error).message}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('providers' in parsed) ||
    typeof (parsed as { providers: unknown }).providers !== 'object' ||
    (parsed as { providers: unknown }).providers === null ||
    Array.isArray((parsed as { providers: unknown }).providers)
  ) {
    throw new Error('ClearURLs JSON missing object providers field');
  }

  return parsed as ClearUrlsData;
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('SHA256 verification requires globalThis.crypto.subtle');
  }

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
