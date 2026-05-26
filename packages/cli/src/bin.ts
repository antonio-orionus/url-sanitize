#!/usr/bin/env node
import { compileSanitizer } from '@url-sanitize/core';
import { clearurlsCatalog } from '@url-sanitize/clearurls';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

const jsonMode = args.includes('--json');
const stripReferral = args.includes('--keep-referral') ? false : args.includes('--strip-referral');
const positional = args.filter((a) => !a.startsWith('--') && !a.startsWith('-'));

const sanitize = compileSanitizer(clearurlsCatalog, {
  stripReferralMarketing: stripReferral
});

for (const url of positional) {
  const result = sanitize(url);
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    switch (result.kind) {
      case 'unchanged':
        process.stdout.write(`${result.url}\n`);
        break;
      case 'cleaned':
      case 'redirected':
        process.stdout.write(`${result.url}\n`);
        break;
      case 'blocked':
        process.stderr.write(`blocked: ${result.original} (via ${result.via.provider})\n`);
        process.exitCode = 2;
        break;
    }
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      'url-sanitize <url> [<url>...]',
      '',
      'Options:',
      '  --json              Emit JSON result objects (one per line)',
      '  --strip-referral    Strip affiliate / referral marketing params (off by default)',
      '  --keep-referral     Explicitly keep referral params (default)',
      '  -h, --help          Show this help',
      ''
    ].join('\n')
  );
}
