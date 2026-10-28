import { defineConfig } from 'vitest/config'

// Tests get their own database, created and migrated by the global setup, so they never touch the one the
// server uses. Override with DATABASE_URL_TEST.
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://ideafactory:ideafactory@localhost:5433/selfevident_test'

export default defineConfig({
  test: {
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: ['./src/test-setup.ts'],
    testTimeout: 20_000,
  },
})
