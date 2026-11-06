import { clearurlsToCatalog } from '@url-sanitize/clearurls/adapter';
import type {
  ClearUrlsData,
  ClearUrlsMetadata,
  ClearUrlsProvider
} from '@url-sanitize/clearurls/types';
import type { SanitizerCatalog } from '@url-sanitize/core';

export const DEFAULT_CLEARURLS_RULES_URL = 'https://rules2.clearurls.xyz/data.minify.json';
export const DEFAULT_CLEARURLS_HASH_URL = 'https://rules2.clearurls.xyz/rules.minify.hash';

/** The published rules are about 300 KB; anything near this cap is not them. */
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

export interface FetchClearurlsCatalogOptions {
  /**
   * SHA256 the rules must match, in addition to the published hash. Leave the
   * key out for no pin. A key that is present but empty or undefined throws,
   * so an unset `process.env` variable can't silently turn pinning off.
   */
  pinnedHash?: string | undefined;
  /** Must be an https: URL. */
  rulesUrl?: string;
  /** Must be an https: URL. */
  hashUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Bounds each request, including reading its body. */
  timeoutMs?: number;
  /** Largest response body accepted, in bytes. Defaults to 16 MiB. */
  maxBytes?: number;
}

export interface FetchClearurlsCatalogResult {
  catalog: SanitizerCatalog;
  metadata: ClearUrlsMetadata;
  raw: ClearUrlsData;
}

export async function fetchClearurlsCatalog(
  options: FetchClearurlsCatalogOptions = {}
): Promise<FetchClearurlsCatalogResult> {
  const rulesUrl = requireHttps(options.rulesUrl ?? DEFAULT_CLEARURLS_RULES_URL, 'rulesUrl');
  const hashUrl = requireHttps(options.hashUrl ?? DEFAULT_CLEARURLS_HASH_URL, 'hashUrl');
  const fetchImpl =
    options.fetch ?? (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('fetchClearurlsCatalog maxBytes must be a positive integer');
  }

  // Checked before any request: a present-but-empty pin is a configuration
  // error, not a request to skip pinning.
  let pinnedHash: string | undefined;
  if (Object.hasOwn(options, 'pinnedHash')) {
    if (!options.pinnedHash?.trim()) {
      throw new Error(
        'fetchClearurlsCatalog pinnedHash is set but empty; leave the key out to skip pinning'
      );
    }
    pinnedHash = normalizeSha256(options.pinnedHash, 'pinned hash');
  }

  if (!fetchImpl) {
    throw new Error('fetchClearurlsCatalog requires a fetch implementation');
  }

  const [rulesTextRaw, expectedHashRaw] = await Promise.all([
    fetchText(fetchImpl, rulesUrl, timeoutMs, maxBytes),
    fetchText(fetchImpl, hashUrl, timeoutMs, maxBytes)
  ]);
  const rulesText = rulesTextRaw.trim();
  const expectedHash = normalizeSha256(expectedHashRaw, 'published hash');
  const actualHash = await sha256Hex(rulesTextRaw);

  if (actualHash !== expectedHash) {
    throw new Error(`ClearURLs rules hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  }

  if (pinnedHash !== undefined && actualHash !== pinnedHash) {
    throw new Error(`ClearURLs pinned hash mismatch: expected ${pinnedHash}, got ${actualHash}`);
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

function requireHttps(url: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`fetchClearurlsCatalog ${label} is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`fetchClearurlsCatalog ${label} must use https: ${url}`);
  }
  return url;
}

async function fetchText(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  timeoutMs: number,
  maxBytes: number
): Promise<string> {
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      throw new Error(`Fetch ${url} failed: ${response.status} ${response.statusText}`.trim());
    }
    // fetch follows redirects, including https -> http.
    if (response.url && !response.url.startsWith('https:')) {
      throw new Error(`Fetch ${url} redirected to a non-https URL: ${response.url}`);
    }
    return await readBody(response, url, maxBytes, signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Fetch ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    // Only now: the timeout must also cover reading the body.
    cleanup();
  }
}

async function readBody(
  response: Response,
  url: string,
  maxBytes: number,
  signal: AbortSignal
): Promise<string> {
  const tooLarge = () => new Error(`Fetch ${url} body exceeds ${maxBytes} bytes`);
  const declared = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge();
    return text;
  }

  // A fetch that ignores the signal once headers arrive would otherwise let
  // a stalled body hang forever.
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read().finally(() => {
      if (signal.aborted) signal.removeEventListener('abort', onAbort);
    });
    if (signal.aborted) throw new DOMException('body read timed out', 'TimeoutError');
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  signal.removeEventListener('abort', onAbort);
  return text + decoder.decode();
}

function createTimeoutSignal(timeoutMs: number): { cleanup: () => void; signal: AbortSignal } {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('fetchClearurlsCatalog timeoutMs must be a positive finite number');
  }

  if (typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  };
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function normalizeSha256(hash: string, label: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid ${label}: expected 64 lowercase hex characters`);
  }
  return normalized;
}

const STRING_LIST_FIELDS = [
  'rules',
  'rawRules',
  'referralMarketing',
  'redirections',
  'exceptions'
] as const;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Check every provider's shape before the adapter sees it: a string where a
 * list belongs is iterated by character, and a missing urlPattern on a
 * completeProvider would block every URL.
 */
function validateProvider(name: string, provider: unknown): ClearUrlsProvider {
  const fail = (why: string): never => {
    throw new Error(`ClearURLs provider ${JSON.stringify(name)}: ${why}`);
  };
  if (typeof provider !== 'object' || provider === null || Array.isArray(provider)) {
    return fail('is not an object');
  }
  const p = provider as Record<string, unknown>;
  if (typeof p.urlPattern !== 'string' || p.urlPattern.length === 0) {
    fail('urlPattern must be a non-empty string');
  }
  for (const flag of ['completeProvider', 'forceRedirection'] as const) {
    if (p[flag] !== undefined && typeof p[flag] !== 'boolean') fail(`${flag} must be a boolean`);
  }
  for (const field of STRING_LIST_FIELDS) {
    if (p[field] !== undefined && !isStringList(p[field])) {
      fail(`${field} must be a list of strings`);
    }
  }
  return p as unknown as ClearUrlsProvider;
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

  const providers: Record<string, ClearUrlsProvider> = {};
  for (const [name, provider] of Object.entries(
    (parsed as { providers: Record<string, unknown> }).providers
  )) {
    providers[name] = validateProvider(name, provider);
  }
  return { providers };
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('SHA256 verification requires globalThis.crypto.subtle');
  }

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
