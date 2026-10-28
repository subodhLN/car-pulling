import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    env: { GEO_PROVIDER: 'fake', NEXT_PUBLIC_MAP_TILES: 'off' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          exclude: ['tests/unit/components/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['tests/unit/components/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/jsdom.ts'],
        },
      },
    ],
  },
});
