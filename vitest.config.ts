import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'engine', root: './engine', include: ['tests/**/*.test.ts'] } },
      {
        test: {
          name: 'api',
          root: './api',
          include: ['tests/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
          env: { NODE_ENV: 'test' },
          testTimeout: 15000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
