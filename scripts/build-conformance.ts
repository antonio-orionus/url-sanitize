/**
 * Build conformance corpus files from seed inputs.
 *
 * Reads:
 *   conformance/inputs/vectors.jsonl   — {id, input, options?, note?}
 *   conformance/inputs/corpus.txt      — one URL per line (# comments allowed)
 *
 * Writes (using the TS engine as oracle):
 *   conformance/vectors.jsonl          — {id, input, options?, expected}
 *   conformance/clearurls-corpus.jsonl — {id, input, expected}
 *
 * The Rust engine must reproduce identical `expected` values for every entry.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearurlsCatalog, clearurlsMetadata } from '@url-sanitize/clearurls';
import { compileSanitizer } from '@url-sanitize/core';
import type { SanitizeResult, SanitizerOptions } from '@url-sanitize/core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const vectorsIn = resolve(root, 'conformance/inputs/vectors.jsonl');
const corpusIn = resolve(root, 'conformance/inputs/corpus.txt');
const vectorsOut = resolve(root, 'conformance/vectors.jsonl');
const corpusOut = resolve(root, 'conformance/clearurls-corpus.jsonl');
const manifestOut = resolve(root, 'conformance/manifest.json');

type SeedVector = {
  id: string;
  input: string;
  options?: SanitizerOptions;
  note?: string;
};

type ExpectedBase = { kind: SanitizeResult['kind'] };
type Expected =
  | (ExpectedBase & { kind: 'unchanged'; url: string })
  | (ExpectedBase & {
      kind: 'cleaned';
      url: string;
      strippedParamsContains: string[];
      matchedProviders: string[];
    })
  | (ExpectedBase & { kind: 'redirected'; url: string; viaProvider: string })
  | (ExpectedBase & { kind: 'blocked'; viaProvider: string });

function resultToExpected(r: SanitizeResult): Expected {
  switch (r.kind) {
    case 'unchanged':
      return { kind: 'unchanged', url: r.url };
    case 'cleaned': {
      const providers = Array.from(new Set(r.matchedRules.map((m) => m.provider))).sort();
      return {
        kind: 'cleaned',
        url: r.url,
        strippedParamsContains: [...new Set(r.strippedParams)].sort(),
        matchedProviders: providers
      };
    }
    case 'redirected':
      return { kind: 'redirected', url: r.url, viaProvider: r.via.provider };
    case 'blocked':
      return { kind: 'blocked', viaProvider: r.via.provider };
  }
}

function sanitizerFor(opts: SanitizerOptions | undefined) {
  return compileSanitizer(clearurlsCatalog, opts ?? {});
}

async function parseSeedVectors(): Promise<SeedVector[]> {
  const text = await readFile(vectorsIn, 'utf8');
  const out: SeedVector[] = [];
  let lineNum = 0;
  for (const line of text.split('\n')) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    let parsed: SeedVector;
    try {
      parsed = JSON.parse(trimmed) as SeedVector;
    } catch (err) {
      throw new Error(`vectors.jsonl line ${lineNum}: ${(err as Error).message}`);
    }
    if (!parsed.id || typeof parsed.input !== 'string') {
      throw new Error(`vectors.jsonl line ${lineNum}: missing id or input`);
    }
    out.push(parsed);
  }
  return out;
}

async function parseCorpusInputs(): Promise<string[]> {
  const text = await readFile(corpusIn, 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

async function main(): Promise<void> {
  const seedVectors = await parseSeedVectors();
  const corpusUrls = await parseCorpusInputs();

  // vectors.jsonl
  const vectorLines: string[] = [];
  for (const v of seedVectors) {
    const result = sanitizerFor(v.options)(v.input);
    const expected = resultToExpected(result);
    const out: Record<string, unknown> = { id: v.id, input: v.input };
    if (v.options) out.options = v.options;
    if (v.note) out.note = v.note;
    out.expected = expected;
    vectorLines.push(JSON.stringify(out));
  }
  await writeFile(vectorsOut, `${vectorLines.join('\n')}\n`);

  // clearurls-corpus.jsonl
  const sanitize = sanitizerFor(undefined);
  const corpusLines: string[] = [];
  let i = 0;
  for (const input of corpusUrls) {
    i++;
    const id = `corpus-${String(i).padStart(4, '0')}`;
    const expected = resultToExpected(sanitize(input));
    corpusLines.push(JSON.stringify({ id, input, expected }));
  }
  await writeFile(corpusOut, `${corpusLines.join('\n')}\n`);

  // manifest with catalog provenance
  const manifest = {
    generatedAt: clearurlsMetadata.fetchedAt,
    catalog: {
      hash: clearurlsMetadata.hash,
      version: clearurlsMetadata.version,
      fetchedAt: clearurlsMetadata.fetchedAt,
      upstream: clearurlsMetadata.upstream
    },
    counts: {
      vectors: vectorLines.length,
      corpus: corpusLines.length
    },
    fileHashes: {
      'vectors.jsonl': sha256(`${vectorLines.join('\n')}\n`),
      'clearurls-corpus.jsonl': sha256(`${corpusLines.join('\n')}\n`)
    }
  };
  await writeFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`wrote ${vectorLines.length} vectors, ${corpusLines.length} corpus entries`);
  console.log(`catalog hash: ${clearurlsMetadata.hash}`);
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
