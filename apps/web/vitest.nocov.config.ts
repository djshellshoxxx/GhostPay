import { configDefaults, defineConfig } from 'vitest/config';
import config from './vite.config';

/**
 * Second test pass for CPU-heavy tests that v8 coverage would deoptimise; coverage is off, nothing else changes.
 * Arrays are replaced (not merged with the base include/exclude) so only `*.nocov.test.*` files run here.
 */
// vite.config.ts is a function of the Vite command; Vitest always runs it as `serve` in mode `test`.
const base = config({ command: 'serve', mode: 'test' });

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.nocov.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    coverage: { ...base.test?.coverage, enabled: false },
  },
});
