import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test'), __APP_BUILD__: JSON.stringify('test'), __APP_BUILT_AT__: JSON.stringify('1970-01-01T00:00:00.000Z'), __APP_BRANCH__: JSON.stringify('') },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
