#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node scripts/bump-version.mjs <semver>');
  process.exit(1);
}

for (const path of [
  'packages/core/package.json',
  'packages/clearurls/package.json',
  'packages/cli/package.json'
]) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

replaceInFile('Cargo.toml', [
  [/version = "[^"]+"/, `version = "${version}"`],
  [
    /url-sanitize-core = \{ path = "crates\/url-sanitize-core", version = "[^"]+" \}/,
    `url-sanitize-core = { path = "crates/url-sanitize-core", version = "${version}" }`
  ]
]);

replaceInFile('pyproject.toml', [[/version = "[^"]+"/, `version = "${version}"`]]);

function replaceInFile(path, replacements) {
  let text = readFileSync(path, 'utf8');
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(text)) {
      throw new Error(`Pattern ${pattern} not found in ${path}`);
    }
    text = text.replace(pattern, replacement);
  }
  writeFileSync(path, text);
}
