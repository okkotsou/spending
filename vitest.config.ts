import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/parser/**/*.ts', 'src/categorize/**/*.ts', 'src/domain/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/parser/fixtures.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 82,
        statements: 90,
      },
    },
  },
});
