#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const platformsPath = new URL('../release/platforms.json', import.meta.url);

export function loadReleasePlatforms() {
  const platforms = JSON.parse(readFileSync(platformsPath, 'utf8'));
  validatePlatforms(platforms);
  return platforms;
}

export function expectedReleaseAssets(platforms = loadReleasePlatforms()) {
  return platforms.map((platform) => platform.archive);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const platforms = loadReleasePlatforms();

  if (args['gha-matrix']) {
    const matrix = JSON.stringify({ include: platforms });
    console.log(`matrix=${matrix}`);
  } else if (args['expected-assets']) {
    console.log(expectedReleaseAssets(platforms).join('\n'));
  } else if (args['synthetic-sums']) {
    const sums = expectedReleaseAssets(platforms)
      .map((asset, index) => `${syntheticSha(index)}  ${asset}`)
      .join('\n');
    writeFileSync(args['synthetic-sums'], `${sums}\n`);
  } else {
    console.log(JSON.stringify(platforms, null, 2));
  }
}

function validatePlatforms(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('release/platforms.json must contain at least one platform');
  }

  const ids = new Set();
  const archives = new Set();
  const targets = new Set();
  const targetPattern = /^[A-Za-z0-9_]+-[A-Za-z0-9_]+-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)?$/;
  const binaryPattern = /^[A-Za-z0-9._-]+$/;

  for (const platform of platforms) {
    for (const key of ['id', 'os', 'target', 'archive', 'binary']) {
      if (typeof platform[key] !== 'string' || platform[key].length === 0) {
        throw new Error(`platform entry missing ${key}: ${JSON.stringify(platform)}`);
      }
    }

    requireUnique(ids, platform.id, 'platform id');
    requireUnique(archives, platform.archive, 'archive');
    requireUnique(targets, platform.target, 'target');

    if (!platform.archive.startsWith('url-sanitize-')) {
      throw new Error(`archive must start with url-sanitize-: ${platform.archive}`);
    }

    if (!platform.archive.endsWith('.tar.gz') && !platform.archive.endsWith('.zip')) {
      throw new Error(`archive must be .tar.gz or .zip: ${platform.archive}`);
    }

    if (!targetPattern.test(platform.target)) {
      throw new Error(`target must be a safe Cargo target triple: ${platform.target}`);
    }

    if (
      !binaryPattern.test(platform.binary) ||
      platform.binary.includes('..') ||
      platform.binary.includes('/') ||
      platform.binary.includes('\\')
    ) {
      throw new Error(`binary must be a safe filename: ${platform.binary}`);
    }
  }

  const homebrewPlatforms = platforms.filter((platform) => platform.homebrew);
  const scoopPlatforms = platforms.filter((platform) => platform.scoop);
  if (homebrewPlatforms.length !== 4) {
    throw new Error(`expected 4 Homebrew platforms, found ${homebrewPlatforms.length}`);
  }
  if (scoopPlatforms.length !== 1 || scoopPlatforms[0].scoop.architecture !== '64bit') {
    throw new Error('expected exactly one Scoop 64bit platform');
  }
}

function requireUnique(seen, value, label) {
  if (seen.has(value)) {
    throw new Error(`duplicate ${label}: ${value}`);
  }
  seen.add(value);
}

function syntheticSha(index) {
  return String(index + 1)
    .padStart(64, '0')
    .slice(-64);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (key === 'gha-matrix' || key === 'expected-assets') {
      parsed[key] = true;
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`missing value for --${key}`);
      }
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}
