import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// CI only builds core-crypto, invoice-schema and chain-adapters, so sibling packages are resolved from source.
const src = (name: string): string =>
  fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ghostpay/ux-vault/portable': fileURLToPath(new URL('../ux-vault/src/portable.ts', import.meta.url)),
      '@ghostpay/core-crypto': src('core-crypto'),
      '@ghostpay/chain-adapters': src('chain-adapters'),
      '@ghostpay/btc-silent-payments': src('btc-silent-payments'),
      '@ghostpay/chain-solana': src('chain-solana'),
      '@ghostpay/chain-tron': src('chain-tron'),
      '@ghostpay/qr-exchange': src('qr-exchange'),
      '@ghostpay/ux-vault': src('ux-vault'),
      '@ghostpay/merchant-multisig': src('merchant-multisig'),
      '@ghostpay/i18n': src('i18n'),
      '@ghostpay/invoice-schema': src('invoice-schema'),
      '@ghostpay/merchant-billing': src('merchant-billing'),
      '@ghostpay/merchant-hooks': src('merchant-hooks'),
      '@ghostpay/merchant-ledger': src('merchant-ledger'),
      '@ghostpay/sandbox': src('sandbox'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.testutil.ts', 'src/index.ts', 'src/bin.ts'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
