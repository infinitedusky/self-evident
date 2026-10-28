/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180, strictPort: true, host: '127.0.0.1', // IPv4 too: some browsers resolve localhost to 127.0.0.1, and Node binds only ::1 by default // one address to remember; `pnpm dev` at the repo root prints it
    // The idea files live one level up, at the repo root.
    fs: { allow: ['..'] },
    // The engine serves its API under /api (and the built UI at / in production); the UI never talks to the database.
    proxy: { '/api': { target: process.env.ENGINE_URL ?? 'http://localhost:4000', changeOrigin: true } },
  },
  test: {
    projects: [{
      // Plain checks over the source, in Node: every page and component has its stories.
      extends: true,
      test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});