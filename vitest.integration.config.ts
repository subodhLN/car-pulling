import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => {
  // Vitest does not load .env into the config process; do it explicitly
  // (Node's loadEnvFile never overrides variables already set).
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env file: rely on the real environment (e.g. CI)
  }
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Copy .env.example to .env (or export it) before running integration tests.',
    );
  }
  // Integration tests run against the dedicated test database only.
  process.env.DATABASE_URL = testUrl;

  return {
    plugins: [tsconfigPaths()],
    test: {
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      pool: 'forks',
      maxWorkers: 1,
      fileParallelism: false,
      globalSetup: ['tests/helpers/global-setup.ts'],
    },
  };
});
