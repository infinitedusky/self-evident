import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests get their own database, created and migrated by the global setup, so they never touch the one the
// server uses. Override with DATABASE_URL_TEST.
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://ideafactory:ideafactory@localhost:5433/selfevident_test'

export default defineConfig({
  test: {
    env: { DATABASE_URL: TEST_DATABASE_URL, SHARED_SKILLS_HOME: join(tmpdir(), 'self-evident-test-shared-skills'), NGROK_PAUSED_FILE: join(tmpdir(), 'self-evident-test-ngrok-paused.json') }, // never the person's own shared skills, nor their list of stopped services
    globalSetup: ['./src/test-setup.ts'],
    testTimeout: 20_000,
  },
})
