import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ghostpay/pool-sdk': r('../pool-sdk/src/index.ts'),
      '@ghostpay/pool-prover': r('../pool-prover/src/index.ts'),
      '@ghostpay/relayer-guard': r('../relayer-guard/src/index.ts'),
      '@ghostpay/secret-box': r('../secret-box/src/index.ts'),
      '@ghostpay/core-crypto': r('../core-crypto/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.testutil.ts', 'src/index.ts', 'src/main.ts'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
