#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { clearurlsCatalog, clearurlsMetadata } from '@url-sanitize/clearurls';
import { type SanitizeResult, type SanitizerOptions, compileSanitizer } from '@url-sanitize/core';

const args = process.argv.slice(2);

runTypeScriptCli(args);

interface Args {
  json: boolean;
  explain: boolean;
  options: SanitizerOptions;
  urls: string[];
  readStdin: boolean;
}

function runTypeScriptCli(rawArgs: string[]): void {
  if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
    printHelp(process.stdout);
    process.exit(0);
  }

  if (rawArgs.includes('--version')) {
    process.stdout.write(
      `url-sanitize ${packageVersion()} (catalog ${clearurlsMetadata.hash} ${clearurlsMetadata.fetchedAt})\n`
    );
    process.exit(0);
  }

  const parsed = parseArgs(rawArgs);
  if (typeof parsed === 'string') {
    process.stderr.write(`error: ${parsed}\n`);
    process.stderr.write('run `url-sanitize --help` for usage\n');
    process.exit(1);
  }

  const sanitize = compileSanitizer(clearurlsCatalog, parsed.options);
  let anyBlocked = false;

  for (const url of parsed.urls) {
    anyBlocked = emit(sanitize(url), parsed.json, parsed.explain) || anyBlocked;
  }

  if (parsed.readStdin || (parsed.urls.length === 0 && !process.stdin.isTTY)) {
    const input = readAllStdin();
    for (const line of input.split(/\r?\n/)) {
      if (line.length === 0) continue;
      anyBlocked = emit(sanitize(line), parsed.json, parsed.explain) || anyBlocked;
    }
  }

  if (parsed.urls.length === 0 && !parsed.readStdin && process.stdin.isTTY) {
    printHelp(process.stderr);
    process.exit(1);
  }

  process.exit(anyBlocked ? 2 : 0);
}

function parseArgs(rawArgs: string[]): Args | string {
  let json = false;
  let explain = false;
  let stripReferral = false;
  let keepReferralExplicit = false;
  let unwrapRedirects: boolean | undefined;
  let domainBlocking = false;
  let readStdin = false;
  const urls: string[] = [];

  for (const arg of rawArgs) {
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--explain':
        explain = true;
        break;
      case '--strip-referral':
        stripReferral = true;
        break;
      case '--keep-referral':
        keepReferralExplicit = true;
        break;
      case '--unwrap-redirects':
        unwrapRedirects = true;
        break;
      case '--no-unwrap-redirects':
        unwrapRedirects = false;
        break;
      case '--block-domains':
        domainBlocking = true;
        break;
      case '-':
        readStdin = true;
        break;
      default:
        if (arg.startsWith('--') || (arg.startsWith('-') && arg.length > 1)) {
          return `unknown flag: ${arg}`;
        }
        urls.push(arg);
    }
  }

  if (keepReferralExplicit) {
    stripReferral = false;
  }

  const options: SanitizerOptions = {
    stripReferralMarketing: stripReferral,
    domainBlocking
  };
  if (unwrapRedirects !== undefined) {
    options.unwrapRedirects = unwrapRedirects;
  }

  return {
    json,
    explain,
    options,
    readStdin,
    urls
  };
}

function emit(result: SanitizeResult, json: boolean, explain: boolean): boolean {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.kind === 'blocked';
  }

  switch (result.kind) {
    case 'unchanged':
      process.stdout.write(`${result.url}\n`);
      return false;
    case 'cleaned':
      process.stdout.write(`${result.url}\n`);
      if (explain) {
        const providers = result.matchedRules.map((rule) => rule.provider).join(',');
        process.stderr.write(`# cleaned: ${result.original} -> ${result.url} [${providers}]\n`);
      }
      return false;
    case 'redirected':
      process.stdout.write(`${result.url}\n`);
      if (explain) {
        process.stderr.write(
          `# redirected: ${result.original} -> ${result.url} [${result.via.provider}]\n`
        );
      }
      return false;
    case 'blocked':
      process.stderr.write(`blocked: ${result.original} (via ${result.via.provider})\n`);
      return true;
  }
}

function readAllStdin(): string {
  return readFileSync(0, 'utf8');
}

function packageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version?: string };
  return pkg.version ?? '0.0.0';
}

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(
    [
      `url-sanitize ${packageVersion()} (catalog ${clearurlsMetadata.hash})`,
      '',
      'Strip tracking parameters from URLs.',
      '',
      'USAGE:',
      '    url-sanitize [OPTIONS] [URL]...',
      '    url-sanitize [OPTIONS] -          read URLs from stdin (one per line)',
      '    url-sanitize [OPTIONS] < file     same',
      '',
      'OPTIONS:',
      '    --json                  Emit one JSON SanitizeResult per input line',
      '    --explain               Default mode, plus a matched-rule line on stderr',
      '    --strip-referral        Strip affiliate / referral marketing params',
      '    --keep-referral         Explicitly keep referral params (default)',
      '    --unwrap-redirects      Unwrap redirector URLs (default)',
      '    --no-unwrap-redirects   Leave redirector URLs untouched',
      '    --block-domains         Emit blocked for domain-blocked URLs',
      '    --version               Print version + catalog hash',
      '    -h, --help              Show this help',
      '',
      'Runtime: TypeScript',
      ''
    ].join('\n')
  );
}
