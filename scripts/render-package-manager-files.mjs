#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadReleasePlatforms } from './release-platforms.mjs';

const args = parseArgs(process.argv.slice(2));

if (!args.version || !args.sums || !args.out) {
  console.error(
    'usage: node scripts/render-package-manager-files.mjs --version <semver> --sums <SHA256SUMS> --out <dir>'
  );
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(args.version)) {
  throw new Error(`invalid semver: ${args.version}`);
}

const sums = parseSums(readFileSync(args.sums, 'utf8'));
const assets = assetsFromPlatforms(loadReleasePlatforms());

for (const asset of Object.values(assets)) {
  if (!sums.has(asset)) {
    throw new Error(`missing checksum for ${asset}`);
  }
}

mkdirSync(join(args.out, 'homebrew', 'Formula'), { recursive: true });
mkdirSync(join(args.out, 'scoop'), { recursive: true });

writeFileSync(
  join(args.out, 'homebrew', 'Formula', 'url-sanitize.rb'),
  renderHomebrew(args.version, assets, sums)
);
writeFileSync(
  join(args.out, 'scoop', 'url-sanitize.json'),
  renderScoop(args.version, assets, sums)
);

function renderHomebrew(version, assetNames, checksums) {
  return `class UrlSanitize < Formula
  desc "Remove tracking parameters and unwrap tracking redirects from URLs"
  homepage "https://github.com/antonio-orionus/url-sanitize"
  version "${version}"
  license "MIT"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/${assetNames.darwinArm64}"
      sha256 "${checksums.get(assetNames.darwinArm64)}"
    elsif Hardware::CPU.intel?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/${assetNames.darwinX64}"
      sha256 "${checksums.get(assetNames.darwinX64)}"
    else
      odie "unsupported macOS architecture"
    end
  elsif OS.linux?
    if Hardware::CPU.arm?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/${assetNames.linuxArm64}"
      sha256 "${checksums.get(assetNames.linuxArm64)}"
    elsif Hardware::CPU.intel?
      url "https://github.com/antonio-orionus/url-sanitize/releases/download/v#{version}/${assetNames.linuxX64}"
      sha256 "${checksums.get(assetNames.linuxX64)}"
    else
      odie "unsupported Linux architecture"
    end
  else
    odie "unsupported operating system"
  end

  def install
    bin.install "url-sanitize"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/url-sanitize --version")
    assert_equal "https://example.com/", shell_output("#{bin}/url-sanitize https://example.com/?utm_source=x").strip
  end
end
`;
}

function renderScoop(version, assetNames, checksums) {
  const manifest = {
    version,
    description: 'Remove tracking parameters and unwrap tracking redirects from URLs.',
    homepage: 'https://github.com/antonio-orionus/url-sanitize',
    license: 'MIT',
    architecture: {
      '64bit': {
        url: `https://github.com/antonio-orionus/url-sanitize/releases/download/v${version}/${assetNames.windowsX64}`,
        hash: checksums.get(assetNames.windowsX64)
      }
    },
    bin: 'url-sanitize.exe',
    checkver: 'github',
    autoupdate: {
      architecture: {
        '64bit': {
          url: `https://github.com/antonio-orionus/url-sanitize/releases/download/v$version/${assetNames.windowsX64}`
        }
      },
      hash: {
        url: 'https://github.com/antonio-orionus/url-sanitize/releases/download/v$version/SHA256SUMS',
        find: `([a-fA-F0-9]{64})\\s+${assetNames.windowsX64.replaceAll('.', '\\.')}`
      }
    }
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseSums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) {
      throw new Error(`invalid SHA256SUMS line: ${line}`);
    }
    sums.set(match[2], match[1].toLowerCase());
  }
  return sums;
}

function assetsFromPlatforms(platforms) {
  return {
    darwinArm64: findArchive(platforms, { homebrew: { os: 'macos', cpu: 'arm' } }),
    darwinX64: findArchive(platforms, { homebrew: { os: 'macos', cpu: 'intel' } }),
    linuxArm64: findArchive(platforms, { homebrew: { os: 'linux', cpu: 'arm' } }),
    linuxX64: findArchive(platforms, { homebrew: { os: 'linux', cpu: 'intel' } }),
    windowsX64: findArchive(platforms, { scoop: { architecture: '64bit' } })
  };
}

function findArchive(platforms, expected) {
  const platform = platforms.find((candidate) => {
    if (expected.homebrew) {
      return (
        candidate.homebrew?.os === expected.homebrew.os &&
        candidate.homebrew?.cpu === expected.homebrew.cpu
      );
    }
    return candidate.scoop?.architecture === expected.scoop.architecture;
  });
  if (!platform) {
    throw new Error(`missing release platform for ${JSON.stringify(expected)}`);
  }
  return platform.archive;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`invalid argument near ${key ?? '<end>'}`);
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}
