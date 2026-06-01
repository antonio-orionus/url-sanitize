import { createHash } from 'node:crypto';
import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vitest';
import { fetchClearurlsCatalog } from '../src/index.js';

const rulesUrl = 'https://rules.test/data.minify.json';
const hashUrl = 'https://rules.test/rules.minify.hash';
const rulesText = JSON.stringify({
  providers: {
    globalRules: {
      urlPattern: '.*',
      rules: ['utm_.+']
    }
  }
});
const rulesHash = sha256(rulesText);

describe('fetchClearurlsCatalog', () => {
  it('fetches, verifies, and adapts ClearURLs data', async () => {
    const result = await fetchClearurlsCatalog({
      rulesUrl,
      hashUrl,
      fetch: fakeFetch({
        [rulesUrl]: rulesText,
        [hashUrl]: rulesHash
      })
    });

    expect(result.metadata.hash).toBe(rulesHash);
    expect(result.metadata.version).toBe(rulesHash.slice(0, 12));
    expect(result.metadata.upstream).toBe(rulesUrl);

    const sanitize = compileSanitizer(result.catalog);
    expect(sanitize('https://example.com/?utm_source=newsletter&id=123')).toMatchObject({
      kind: 'cleaned',
      url: 'https://example.com/?id=123'
    });
  });

  it('hashes the raw rules text before parsing', async () => {
    const rulesTextWithNewline = `${rulesText}\n`;
    const rulesHashWithNewline = sha256(rulesTextWithNewline);

    const result = await fetchClearurlsCatalog({
      rulesUrl,
      hashUrl,
      fetch: fakeFetch({
        [rulesUrl]: rulesTextWithNewline,
        [hashUrl]: rulesHashWithNewline
      })
    });

    expect(result.metadata.hash).toBe(rulesHashWithNewline);
  });

  it('uses the injected fetch implementation', async () => {
    const seen: string[] = [];
    await fetchClearurlsCatalog({
      rulesUrl,
      hashUrl,
      fetch: async (url) => {
        seen.push(String(url));
        return textResponse(String(url) === rulesUrl ? rulesText : rulesHash);
      }
    });

    expect(seen.sort()).toEqual([hashUrl, rulesUrl].sort());
  });

  it('binds the default fetch implementation to globalThis', async () => {
    const originalFetch = globalThis.fetch;
    const seenThisValues: unknown[] = [];
    globalThis.fetch = async function (
      this: typeof globalThis,
      url: Parameters<typeof globalThis.fetch>[0]
    ): Promise<Response> {
      seenThisValues.push(this);
      return textResponse(String(url) === rulesUrl ? rulesText : rulesHash);
    } as typeof globalThis.fetch;

    try {
      await fetchClearurlsCatalog({ rulesUrl, hashUrl });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(seenThisValues).toEqual([globalThis, globalThis]);
  });

  it('throws a timeout-specific error when a fetch stalls', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        timeoutMs: 1,
        fetch: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error('missing timeout signal'));
              return;
            }
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('timed out', 'TimeoutError')),
              { once: true }
            );
          })
      })
    ).rejects.toThrow(/timed out after 1ms/);
  });

  it('throws on HTTP failures', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        fetch: fakeFetch({ [rulesUrl]: rulesText }, { [hashUrl]: 503 })
      })
    ).rejects.toThrow(/Fetch .* failed: 503/);
  });

  it('throws on invalid JSON', async () => {
    const invalid = '{not json';
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        fetch: fakeFetch({
          [rulesUrl]: invalid,
          [hashUrl]: sha256(invalid)
        })
      })
    ).rejects.toThrow(/Failed to parse ClearURLs JSON/);
  });

  it('throws on upstream hash mismatch', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        fetch: fakeFetch({
          [rulesUrl]: rulesText,
          [hashUrl]: '0'.repeat(64)
        })
      })
    ).rejects.toThrow(/rules hash mismatch/);
  });

  it('throws on pinned hash mismatch', async () => {
    await expect(
      fetchClearurlsCatalog({
        pinnedHash: 'f'.repeat(64),
        rulesUrl,
        hashUrl,
        fetch: fakeFetch({
          [rulesUrl]: rulesText,
          [hashUrl]: rulesHash
        })
      })
    ).rejects.toThrow(/pinned hash mismatch/);
  });
});

function fakeFetch(
  bodies: Record<string, string>,
  statuses: Record<string, number> = {}
): typeof globalThis.fetch {
  return async (url) => {
    const key = String(url);
    const status = statuses[key] ?? 200;
    if (status !== 200) return textResponse('', status);
    const body = bodies[key];
    if (body === undefined) return textResponse('', 404);
    return textResponse(body);
  };
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => body
  } as Response;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
