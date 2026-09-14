import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  // Relative base so the static build can be hosted from any sub-directory.
  base: './',
  resolve: {
    alias: { '@': srcDir },
  },
  build: {
    target: 'es2022',
    // PRD 9: keep the first payload small; everything ships locally (no CDN).
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
