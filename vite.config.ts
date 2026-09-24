import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js représente l'essentiel du bundle
    chunkSizeWarningLimit: 1000,
  },
});
