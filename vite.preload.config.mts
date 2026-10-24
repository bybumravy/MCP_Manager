import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main/preload',
    emptyOutDir: true,
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rolldownOptions: {
      external: ['electron'],
    },
  },
});
