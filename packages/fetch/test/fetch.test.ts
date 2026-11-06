import { createHash } from 'node:crypto';

import { compileSanitizer } from '@url-sanitize/core';
import { describe, expect, it } from 'vite-plus/test';

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
        seen.push(requestUrl(url));
        return textResponse(requestUrl(url) === rulesUrl ? rulesText : rulesHash);
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
      return textResponse(requestUrl(url) === rulesUrl ? rulesText : rulesHash);
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

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '  ']
  ])('fails closed when pinnedHash is %s, before any request', async (_label, pinnedHash) => {
    let requests = 0;
    await expect(
      fetchClearurlsCatalog({
        pinnedHash,
        rulesUrl,
        hashUrl,
        fetch: async (url) => {
          requests++;
          return textResponse(requestUrl(url) === rulesUrl ? rulesText : rulesHash);
        }
      })
    ).rejects.toThrow(/pinnedHash is set but empty/);
    expect(requests).toBe(0);
  });

  it.each([
    ['rulesUrl', { rulesUrl: 'http://rules.test/data.minify.json', hashUrl }],
    ['hashUrl', { rulesUrl, hashUrl: 'http://rules.test/rules.minify.hash' }]
  ])('rejects a non-https %s', async (label, urls) => {
    await expect(fetchClearurlsCatalog({ ...urls, fetch: fakeFetch({}) })).rejects.toThrow(
      new RegExp(`${label} must use https`)
    );
  });

  it('rejects a redirect to http', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        fetch: async (url) => {
          const body = requestUrl(url) === rulesUrl ? rulesText : rulesHash;
          return Object.assign(textResponse(body), { url: 'http://evil.test/data.json' });
        }
      })
    ).rejects.toThrow(/redirected to a non-https URL/);
  });

  it('rejects a streamed body over maxBytes', async () => {
    const big = JSON.stringify({ providers: {}, pad: 'x'.repeat(4096) });
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        maxBytes: 1024,
        fetch: async (url) => new Response(requestUrl(url) === rulesUrl ? big : sha256(big))
      })
    ).rejects.toThrow(/body exceeds 1024 bytes/);
  });

  it('rejects a declared Content-Length over maxBytes without reading the body', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        maxBytes: 1024,
        fetch: async () =>
          new Response(new ReadableStream(), { headers: { 'content-length': '999999' } })
      })
    ).rejects.toThrow(/body exceeds 1024 bytes/);
  });

  it('times out a body that stalls after the headers', async () => {
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        timeoutMs: 50,
        // Ignores the signal: the body never ends.
        fetch: async () => new Response(new ReadableStream())
      })
    ).rejects.toThrow(/timed out after 50ms/);
  });

  it.each([
    [
      'a string where a list belongs',
      { p: { urlPattern: '.*', rules: 'utm_source' } },
      /rules must be a list of strings/
    ],
    [
      'a completeProvider without urlPattern',
      { p: { completeProvider: true } },
      /urlPattern must be a non-empty string/
    ],
    ['a null provider', { p: null }, /is not an object/],
    [
      'a non-boolean flag',
      { p: { urlPattern: '.*', completeProvider: 'yes' } },
      /completeProvider must be a boolean/
    ],
    [
      'a non-string exception',
      { p: { urlPattern: '.*', exceptions: [1] } },
      /exceptions must be a list of strings/
    ]
  ])('rejects %s', async (_label, providers, message) => {
    const text = JSON.stringify({ providers });
    await expect(
      fetchClearurlsCatalog({
        rulesUrl,
        hashUrl,
        fetch: fakeFetch({ [rulesUrl]: text, [hashUrl]: sha256(text) })
      })
    ).rejects.toThrow(message);
  });
});

function fakeFetch(
  bodies: Record<string, string>,
  statuses: Record<string, number> = {}
): typeof globalThis.fetch {
  return async (url) => {
    const key = requestUrl(url);
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

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}
