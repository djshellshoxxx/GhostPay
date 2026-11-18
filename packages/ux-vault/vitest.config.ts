import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: {
    '@ghostpay/ux-vault/portable': fileURLToPath(new URL('./src/portable.ts', import.meta.url)),
    '@ghostpay/core-crypto': fileURLToPath(new URL('../core-crypto/src/index.ts', import.meta.url)),
    '@ghostpay/invoice-schema': fileURLToPath(new URL('../invoice-schema/src/index.ts', import.meta.url)),
    '@ghostpay/chain-adapters': fileURLToPath(new URL('../chain-adapters/src/index.ts', import.meta.url)),
  } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.testutil.ts', 'src/index.ts'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
