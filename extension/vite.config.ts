import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    target: 'es2022',
    // Transformers.js is a single lazily-loaded ML bundle — its size is expected.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        popup: 'popup.html',
      },
      onwarn(warning, warn) {
        // onnxruntime-web ships an eval-based fallback path we never execute
        // (MV3 CSP forbids it; the WASM backend is used instead).
        if (warning.code === 'EVAL' && warning.id?.includes('onnxruntime-web')) return;
        warn(warning);
      },
    },
  },
});
