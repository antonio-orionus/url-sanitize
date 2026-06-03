/**
 * Compile source-of-truth catalogs (rules + provenance) to `catalog/*.json`.
 *
 * The Rust binary `include_str!`s the merged catalog at build time. The TS
 * engine already constructs the same structure in memory; this script freezes
 * it to disk so non-JS implementations don't re-derive it.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adguardCatalog } from '@url-sanitize/adguard';
import { braveCatalog } from '@url-sanitize/brave';
import { clearurlsCatalog } from '@url-sanitize/clearurls';
import { firefoxCatalog } from '@url-sanitize/firefox';
import { mergedCatalog } from '@url-sanitize/merged';

const here = dirname(fileURLToPath(import.meta.url));
const catalogDir = resolve(here, '..', 'catalog');
const binCrateCopy = resolve(here, '..', 'crates', 'url-sanitize', 'catalog', 'catalog.json');

async function main(): Promise<void> {
  await mkdir(catalogDir, { recursive: true });
  const catalogs = {
    'adguard.json': adguardCatalog,
    'brave.json': braveCatalog,
    'catalog.json': mergedCatalog,
    'clearurls.json': clearurlsCatalog,
    'firefox.json': firefoxCatalog
  };

  for (const [name, catalog] of Object.entries(catalogs)) {
    const body = JSON.stringify(catalog, null, 2);
    const out = resolve(catalogDir, name);
    await writeFile(out, `${body}\n`);
    console.log(`wrote ${out}`);
    console.log(`${name} rules: ${catalog.rules.length}`);
    console.log(`${name} sha256: ${createHash('sha256').update(body).digest('hex')}`);
  }

  const mergedBody = JSON.stringify(mergedCatalog);
  await mkdir(dirname(binCrateCopy), { recursive: true });
  await writeFile(binCrateCopy, `${mergedBody}\n`);
  console.log(`wrote ${binCrateCopy}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
