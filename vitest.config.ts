import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ['tests/helpers/globalSetup.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: { provider: 'v8', include: ['src/**'] },
  },
});
