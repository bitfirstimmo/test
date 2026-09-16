import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
      '/steuerung': 'http://localhost:3000',
      '/anzeige': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    sourcemap: true
  }
});
