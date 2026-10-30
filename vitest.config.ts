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
          env: {
            NODE_ENV: 'test',
            TRUST_PROXY: '1',
            GOOGLE_CLIENT_IDS: 'test-web.apps.googleusercontent.com,test-android.apps.googleusercontent.com',
          },
          testTimeout: 15000,
          hookTimeout: 30000,
          fileParallelism: false,
        },
      },
    ],
  },
});
