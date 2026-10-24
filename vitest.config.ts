import { defineConfig } from 'vitest/config';

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
