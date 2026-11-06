#!/usr/bin/env node
import { once } from 'node:events';
import { createRequire } from 'node:module';

import { compileSanitizer, type SanitizeResult, type SanitizerOptions } from '@url-sanitize/core';
import { mergedCatalog, mergedMetadata } from '@url-sanitize/merged';

const args = process.argv.slice(2);

// Control and bidi-override characters, percent-encoded by printable(). Declared
// before runTypeScriptCli() runs: a later `const` is not yet initialized.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;
const utf8 = new TextEncoder();

// A reader that closes early (`| head -1`) ends the run quietly. Any other
// write error must not look like success.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0);
  process.stderr.write(`error: writing output: ${err.message}\n`);
  process.exit(1);
});

runTypeScriptCli(args).catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

interface Args {
  action: 'run' | 'help' | 'version';
  json: boolean;
  explain: boolean;
  options: SanitizerOptions;
  urls: string[];
  readStdin: boolean;
}

// process.exit() would drop output still queued for a pipe, so every path
// sets process.exitCode and returns, letting stdout drain.
async function runTypeScriptCli(rawArgs: string[]): Promise<void> {
  const parsed = parseArgs(rawArgs);
  if (typeof parsed === 'string') {
    process.stderr.write(`error: ${parsed}\n`);
    process.stderr.write('run `url-sanitize --help` for usage\n');
    process.exitCode = 1;
    return;
  }

  if (parsed.action === 'help') {
    printHelp(process.stdout);
    return;
  }

  if (parsed.action === 'version') {
    process.stdout.write(
      `url-sanitize ${packageVersion()} (catalog ${catalogHash()} ${mergedMetadata.generatedAt})\n`
    );
    return;
  }

  const sanitize = compileSanitizer(mergedCatalog, parsed.options);
  let anyBlocked = false;

  for (const url of parsed.urls) {
    anyBlocked = emit(sanitize(url), parsed.json, parsed.explain) || anyBlocked;
  }

  if (parsed.readStdin || (parsed.urls.length === 0 && !process.stdin.isTTY)) {
    for await (const line of stdinLines()) {
      if (line.length === 0) continue;
      anyBlocked = emit(sanitize(line), parsed.json, parsed.explain) || anyBlocked;
      // Wait for a slow reader instead of queueing all output in memory.
      if (process.stdout.writableNeedDrain) await once(process.stdout, 'drain');
    }
  }

  if (parsed.urls.length === 0 && !parsed.readStdin && process.stdin.isTTY) {
    printHelp(process.stderr);
    process.exitCode = 1;
    return;
  }

  process.exitCode = anyBlocked ? 2 : 0;
}

function parseArgs(rawArgs: string[]): Args | string {
  let json = false;
  let explain = false;
  let stripReferral = false;
  let keepReferralExplicit = false;
  let unwrapRedirects: boolean | undefined;
  let domainBlocking = false;
  let readStdin = false;
  let action: Args['action'] = 'run';
  let endOfOptions = false;
  const urls: string[] = [];

  for (const arg of rawArgs) {
    // After `--` every argument is a URL, so `url-sanitize -- "$untrusted"`
    // can't be turned into a flag.
    if (endOfOptions) {
      urls.push(arg);
      continue;
    }
    switch (arg) {
      case '--':
        endOfOptions = true;
        break;
      case '-h':
      case '--help':
        action = 'help';
        break;
      case '--version':
        if (action !== 'help') action = 'version';
        break;
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
    action,
    json,
    explain,
    options,
    readStdin,
    urls
  };
}

/**
 * Percent-encode control and bidi-override characters for text output: an
 * unparseable input is echoed as given, and `\x1b[...` or U+202E in it would
 * reach the terminal. Must match `printable()` in the Rust CLI.
 */
function printable(text: string): string {
  return text.replace(UNPRINTABLE, (ch) =>
    Array.from(utf8.encode(ch), (b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join('')
  );
}

function emit(result: SanitizeResult, json: boolean, explain: boolean): boolean {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.kind === 'blocked';
  }

  switch (result.kind) {
    case 'unchanged':
      process.stdout.write(`${printable(result.url)}\n`);
      return false;
    case 'cleaned':
      process.stdout.write(`${printable(result.url)}\n`);
      if (explain) {
        const providers = result.matchedRules.map((rule) => rule.provider).join(',');
        process.stderr.write(
          `# cleaned: ${printable(result.original)} -> ${printable(result.url)} [${printable(providers)}]\n`
        );
      }
      return false;
    case 'redirected':
      process.stdout.write(`${printable(result.url)}\n`);
      if (explain) {
        process.stderr.write(
          `# redirected: ${printable(result.original)} -> ${printable(result.url)} [${printable(result.via.provider)}]\n`
        );
      }
      return false;
    case 'blocked':
      process.stderr.write(
        `blocked: ${printable(result.original)} (via ${printable(result.via.provider)})\n`
      );
      return true;
  }
}

/**
 * Stream stdin line by line. readFileSync(0) buffers all of stdin and fails
 * with EAGAIN when the writer is slower than the reader. Lines split on
 * `\n` with trailing `\r` removed, and invalid UTF-8 becomes U+FFFD, as in
 * the Rust CLI.
 */
async function* stdinLines(): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let pending = '';
  for await (const chunk of process.stdin as AsyncIterable<Uint8Array>) {
    pending += decoder.decode(chunk, { stream: true });
    let start = 0;
    let nl = pending.indexOf('\n', start);
    while (nl !== -1) {
      yield pending.slice(start, nl).replace(/\r+$/, '');
      start = nl + 1;
      nl = pending.indexOf('\n', start);
    }
    pending = pending.slice(start);
  }
  pending += decoder.decode();
  if (pending.length > 0) yield pending.replace(/\r+$/, '');
}

function packageVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version?: string };
  return pkg.version ?? '0.0.0';
}

function catalogHash(): string {
  const hashes = mergedCatalog.sources
    .map((source) => source.hash)
    .filter(Boolean)
    .join(':');
  return hashes || mergedCatalog.version;
}

function printHelp(stream: NodeJS.WritableStream): void {
  stream.write(
    [
      `url-sanitize ${packageVersion()} (catalog ${catalogHash()} ${mergedMetadata.generatedAt})`,
      '',
      'Strip tracking parameters from URLs with the merged multi-source catalog.',
      '',
      'USAGE:',
      '    url-sanitize [OPTIONS] [URL]...',
      '    url-sanitize [OPTIONS] -          read URLs from stdin (one per line)',
      '    url-sanitize [OPTIONS] < file     same',
      '    url-sanitize [OPTIONS] -- [URL]... treat every later argument as a URL',
      '',
      'OPTIONS:',
      '    --json                  Emit one JSON SanitizeResult per input line',
      '    --explain               Default mode, plus a matched-rule line on stderr',
      '    --strip-referral        Strip affiliate / referral marketing params',
      '    --keep-referral         Explicitly keep referral params (default)',
      '    --unwrap-redirects      Unwrap redirector URLs (default)',
      '    --no-unwrap-redirects   Leave redirector URLs untouched',
      '    --block-domains         Emit blocked for domain-blocked URLs',
      '    --version               Print version + catalog hash/date',
      '    -h, --help              Show this help',
      '',
      'Runtime: TypeScript',
      ''
    ].join('\n')
  );
}
