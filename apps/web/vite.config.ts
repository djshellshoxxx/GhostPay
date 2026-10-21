import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Static, CSP-friendly build: no inline scripts or styles, no source maps, no data: URI inlining,
// no modulepreload polyfill (it injects inline code). Everything is emitted as same-origin files.
export default defineConfig({
  plugins: [
    react(),
    {
      // The dev server and React Refresh inject inline scripts; the production CSP meta must not apply there.
      name: 'ghostpay-dev-without-meta-csp',
      apply: 'serve',
      transformIndexHtml: (html: string): string =>
        html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
    },
  ],
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Exclusions are justified in DEVIATIONS.md (section "Coverage exclusions").
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.testutil.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/lib/scanner.worker.ts',
        'src/lib/idbStore.ts',
        'src/lib/defaultServices.ts',
        'src/lib/workerFactory.ts',
      ],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
