import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/bin.ts'],
    format: 'esm',
    // Keep tsup's file names (`bin.js`): package.json `exports` points at them.
    fixedExtension: false,
    dts: false,
    // tsup emitted no source maps; tsdown would follow tsconfig's.
    sourcemap: false,
    clean: true,
    target: 'es2022'
  }
});
