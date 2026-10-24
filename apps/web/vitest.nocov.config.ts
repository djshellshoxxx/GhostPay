import { configDefaults, defineConfig } from 'vitest/config';
import base from './vite.config';

/**
 * Second test pass for CPU-heavy tests that v8 coverage would deoptimise; coverage is off, nothing else changes.
 * Arrays are replaced (not merged with the base include/exclude) so only `*.nocov.test.*` files run here.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.nocov.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    coverage: { ...base.test?.coverage, enabled: false },
  },
});
