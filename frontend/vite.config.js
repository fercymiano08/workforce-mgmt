import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Every production build gets its own id. It is baked into the app (__APP_BUILD__) and also written to
// dist/version.json, so a browser tab that was opened before an update can notice it is out of date
// (see src/hooks/useNewVersion.js) instead of running old screens against the updated server.
const BUILD_ID = new Date().toISOString();

function buildVersionFile() {
  return {
    name: 'build-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// One backend, one process: every /api/* call proxies to it.
export default defineConfig({
  plugins: [react(), tailwindcss(), buildVersionFile()],
  define: {
    __APP_BUILD__: JSON.stringify(BUILD_ID),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
