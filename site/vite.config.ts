import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Relative asset paths: Pages serves the site under /url-sanitize/.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022'
  }
});
