import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { applyConnectSrc, parseOrigins } from './scripts/csp.mjs';
import { parseReleaseKeys, validateDeployments } from './scripts/validate-deployments.mjs';

const releaseKeys = parseReleaseKeys(process.env['GHOSTPAY_RELEASE_PUBKEYS']);
const connectOrigins = parseOrigins(process.env['GHOSTPAY_CONNECT_ORIGINS']);
const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const deploymentsDir = process.env['GHOSTPAY_DEPLOYMENTS_DIR'] === undefined ? here('./deployments') : resolve(process.env['GHOSTPAY_DEPLOYMENTS_DIR']);
/** Raw text of `<chainId>.json` files, compiled into the bundle (validated in the build plugin below). */
function readManifests(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const m = /^([1-9][0-9]{0,15})\.json$/.exec(name);
    if (m?.[1] !== undefined) out[m[1]] = readFileSync(resolve(dir, name), 'utf8');
  }
  return out;
}
let outDir = here('./dist');

// Static, CSP-friendly build: no inline scripts or styles, no source maps, no data: URI inlining,
// no modulepreload polyfill (it injects inline code). Everything is emitted as same-origin files.
export default defineConfig({
  define: { __GHOSTPAY_RELEASE_KEYS__: JSON.stringify(releaseKeys), __GHOSTPAY_MANIFESTS__: JSON.stringify(readManifests(deploymentsDir)) },
  plugins: [
    react(),
    {
      // Manifests are compiled into the hashed bundle (S3-01): a bad one must stop the build. The connect-src list (S3-11)
      // is applied to the meta CSP and to dist/_headers.
      name: 'ghostpay-build-policy',
      apply: 'build',
      async buildStart() {
        const problems = await validateDeployments(deploymentsDir, releaseKeys);
        if (problems.length > 0) throw new Error(`deployments/ failed validation:\n - ${problems.join('\n - ')}`);
      },
      transformIndexHtml: (html: string): string => applyConnectSrc(html, connectOrigins),
      configResolved(c) {
        outDir = resolve(c.root, c.build.outDir);
      },
      closeBundle() {
        const headers = resolve(outDir, '_headers');
        if (connectOrigins.length > 0 && existsSync(headers)) writeFileSync(headers, applyConnectSrc(readFileSync(headers, 'utf8'), connectOrigins));
      },
    },
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
