import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'shared/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    globals: false,
    clearMocks: true,
  },
});
