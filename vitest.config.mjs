import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_PASSWORD: 'test-password',
            AUTH_SECRET: 'test-secret',
            TEST_TODAY: '2026-08-05', // pin "today" mid-holidays
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.js'],
    },
  };
});
