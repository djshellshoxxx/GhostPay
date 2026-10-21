import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // src/cli.ts is excluded: a 6-line process-wiring entrypoint (argv/env/fetch/SIGINT -> runCli);
      // all logic lives in src/cli-lib.ts, which is covered.
      exclude: ['src/**/*.test.ts', 'src/**/*.testutil.ts', 'src/index.ts', 'src/cli.ts'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
