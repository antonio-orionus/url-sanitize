import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'conformance/*.test.ts']
  },
  staged: {
    '*.{ts,mts,cts,js,mjs,cjs,json,jsonc}': 'vp check --fix'
  },
  fmt: {
    // Mirrors the former Biome profile: 2 spaces, 100 columns, single quotes, semicolons,
    // no trailing commas, sorted imports.
    tabWidth: 2,
    printWidth: 100,
    singleQuote: true,
    semi: true,
    trailingComma: 'none',
    sortImports: true,
    sortPackageJson: false,
    // Same scope Biome formatted: code and JSON, not docs, workflows or generated data.
    ignorePatterns: [
      '**/*.md',
      '**/*.yml',
      '**/*.yaml',
      '**/*.toml',
      'packages/*/data/**/*.json',
      'catalog/**/*.json',
      'conformance/**/*.jsonl',
      'conformance/manifest.json',
      'crates/**',
      'python/**',
      'target/**',
      'dist/**'
    ]
  },
  lint: {
    ignorePatterns: ['**/dist/**', 'target/**', 'crates/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true }
  }
});
