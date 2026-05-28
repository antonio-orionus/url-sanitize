/**
 * Compile the source-of-truth ClearURLs catalog (rules + provenance) to
 * `catalog/clearurls.json`, the language-agnostic format both engines load.
 *
 * The Rust binary `include_str!`s this file at build time. The TS engine
 * already constructs the same structure in memory; this script just freezes
 * it to disk so non-JS implementations don't re-derive it.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearurlsCatalog } from '@url-sanitize/clearurls';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'catalog', 'clearurls.json');

async function main(): Promise<void> {
  const body = JSON.stringify(clearurlsCatalog, null, 2);
  await writeFile(out, `${body}\n`);
  const hash = createHash('sha256').update(body).digest('hex');
  console.log(`wrote ${out}`);
  console.log(`rules: ${clearurlsCatalog.rules.length}`);
  console.log(`sha256: ${hash}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
