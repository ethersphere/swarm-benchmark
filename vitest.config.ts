import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Show the tool's spinner/console output only for failing tests.
    silent: 'passed-only',
    // Bee-mocking integration tests set module mocks; keep them isolated.
    clearMocks: true,
    restoreMocks: true,
  },
});
