#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { expectedReleaseAssets, loadReleasePlatforms } from './release-platforms.mjs';

const args = parseArgs(process.argv.slice(2));
const errors = [];
const versions = new Map();

for (const path of [
  'packages/core/package.json',
  'packages/clearurls/package.json',
  'packages/cli/package.json'
]) {
  setVersion(path, () => JSON.parse(readFileSync(path, 'utf8')).version);
}

const rootCargo = readFileSync('Cargo.toml', 'utf8');
setVersion('Cargo.toml [workspace.package]', () =>
  mustMatch(
    rootCargo,
    /\[workspace\.package\][\s\S]*?version = "([^"]+)"/,
    'Cargo workspace version'
  )
);
setVersion('Cargo.toml [workspace.dependencies.url-sanitize-core]', () => {
  const dependency = mustMatch(
    rootCargo,
    /url-sanitize-core\s*=\s*\{([\s\S]*?)\}/,
    'Cargo workspace dependency entry'
  );
  if (!/path\s*=\s*"crates\/url-sanitize-core"/.test(dependency)) {
    throw new Error('Cargo workspace dependency path for url-sanitize-core is invalid');
  }
  return mustMatch(dependency, /version\s*=\s*"([^"]+)"/, 'Cargo workspace dependency version');
});

setVersion('pyproject.toml', () =>
  mustMatch(
    mustMatch(
      readFileSync('pyproject.toml', 'utf8'),
      /\[project\]([\s\S]*?)(?:\n\[|$)/,
      'PyPI project table'
    ),
    /\nversion\s*=\s*"([^"]+)"/,
    'PyPI version'
  )
);

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size !== 1) {
  errors.push(
    `release versions diverged:\n${[...versions].map(([path, version]) => `  ${path}: ${version}`).join('\n')}`
  );
}

const version = [...uniqueVersions][0];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  errors.push(`invalid release version: ${version}`);
}

if (args.tag && args.tag !== `v${version}`) {
  errors.push(`tag ${args.tag} does not match release version v${version}`);
}

const platforms = loadReleasePlatforms();
const assets = expectedReleaseAssets(platforms);
const missingInstallerTargets = platforms.filter(
  (platform) => platform.archive.endsWith('.tar.gz') && platform.binary !== 'url-sanitize'
);
if (missingInstallerTargets.length > 0) {
  errors.push(
    `tar.gz installer platforms must expose url-sanitize binary: ${missingInstallerTargets.map((platform) => platform.id).join(', ')}`
  );
}

if (!assets.includes('url-sanitize-x86_64-pc-windows-msvc.zip')) {
  errors.push(
    'release platform matrix must include Windows x64 archive for PowerShell/Scoop installers'
  );
}

if (errors.length > 0) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}

console.log(`release verification passed for v${version}`);
console.log(`release assets:\n${assets.map((asset) => `- ${asset}`).join('\n')}`);

function mustMatch(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`${label} not found`);
  }
  return match[1];
}

function setVersion(label, readVersion) {
  try {
    const version = readVersion();
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`${label} is empty`);
    }
    versions.set(label, version);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  const normalized = argv.filter((arg) => arg !== '--');
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (arg === '--tag') {
      parsed.tag = normalized[index + 1];
      index += 1;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return parsed;
}
