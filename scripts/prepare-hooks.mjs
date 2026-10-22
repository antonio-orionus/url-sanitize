#!/usr/bin/env node
// Runs on `pnpm install`, before `vp config`. Clones set up before the Vite+
// migration still point core.hooksPath at husky's dispatcher, which `vp config`
// leaves alone. That dispatcher exits 0 once .husky/pre-commit and .husky/pre-push
// are gone, so every hook would be skipped without a word. Drop the setting so
// `vp config` can install the .vite-hooks dispatcher.
import { execFileSync } from 'node:child_process';

const HUSKY_HOOKS_PATH = '.husky/_';

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

let hooksPath = '';
try {
  hooksPath = git('config', '--local', '--get-all', 'core.hooksPath');
} catch {
  // Not set in this clone, or not a git checkout: nothing to migrate. Husky only
  // ever wrote the local setting; a global hooksPath is the developer's own.
}

if (hooksPath.split('\n').includes(HUSKY_HOOKS_PATH)) {
  git('config', '--local', '--unset-all', 'core.hooksPath', '^\\.husky/_$');
  console.log(`prepare: removed core.hooksPath=${HUSKY_HOOKS_PATH} left by husky`);
}
