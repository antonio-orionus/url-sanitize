import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: 'esm',
    // Keep tsup's file names (`index.js`, `index.d.ts`): package.json `exports` points at them.
    fixedExtension: false,
    // tsup emitted no source or declaration maps; tsdown would follow tsconfig's.
    dts: { sourcemap: false },
    sourcemap: false,
    clean: true,
    target: 'es2022'
  }
});
