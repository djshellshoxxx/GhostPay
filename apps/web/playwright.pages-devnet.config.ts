import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

/*
 * The GitHub Pages artifact against a REAL local anvil (BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh,
 * which starts anvil, deploys, signs the 84532 devnet manifest and then runs this config). The web server is the actual
 * Pages build (scripts/pages/build-pages.sh: lean profile, relative base, bundle scans, site verifier) with that signed
 * manifest bundled, served by scripts/pages/serve-pages.mjs under /GhostPay/ exactly like a GitHub project page (no
 * security headers, sub-path only). Only e2e/pages-devnet.spec.ts runs here. The build goes to a new directory under
 * the runner's temp dir and its own port (default 4175), so it never touches apps/web/dist or the other suites' 4173/4174.
 */

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));

const PAGES_BASE = '/GhostPay/';
const statePath = process.env['GHOSTPAY_DEVNET_STATE'];
const out = process.env['GHOSTPAY_PAGES_OUT'];
const port = Number(process.env['GHOSTPAY_PAGES_WEB_PORT'] ?? '4175');
if (statePath === undefined || out === undefined || !isAbsolute(out)) {
  throw new Error('Run BROWSER_DEVNET_MODE=pages scripts/beta/browser-devnet.sh: GHOSTPAY_DEVNET_STATE and an absolute GHOSTPAY_PAGES_OUT are required.');
}
if (!Number.isSafeInteger(port) || port === 4173 || port === 4174 || port < 1024 || port > 65535) throw new Error('Invalid GHOSTPAY_PAGES_WEB_PORT (4173/4174 belong to the other suites).');
const state = JSON.parse(readFileSync(statePath, 'utf8')) as { publicKey: string; deploymentsDir: string; chainId: number };
if (state.chainId !== 84532 || !/^0[23][0-9a-f]{64}$/.test(state.publicKey)) throw new Error('Unexpected devnet state file.');
// The new output directory sits under the run's temp directory (next to the state file), never in the source tree.
if (!resolve(out).startsWith(`${dirname(resolve(statePath))}/`)) throw new Error('GHOSTPAY_PAGES_OUT must be inside the run temp directory.');

const ROOT = resolve(import.meta.dirname, '../..');
const site = `${out}/site`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /pages-devnet\.spec\.ts$/,
  // Traces/screenshots of a failed run stay with the runner's temp directory, never in the source tree.
  outputDir: `${out}-results`,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(port)}${PAGES_BASE}`,
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath, args: ['--no-sandbox'] } }),
    serviceWorkers: 'block',
    // A stuck action fails within this bound instead of consuming the whole test budget.
    actionTimeout: 30_000,
  },
  webServer: {
    // The real Pages build (its own gates: typecheck, vite build, bundle scan, site verifier), then the Pages stand-in.
    command: `bash "${ROOT}/scripts/pages/build-pages.sh" "${out}" && node "${ROOT}/scripts/pages/serve-pages.mjs" "${site}" --port ${String(port)} --base ${PAGES_BASE}`,
    url: `http://localhost:${String(port)}${PAGES_BASE}`,
    reuseExistingServer: false,
    timeout: 480_000,
    stdout: 'pipe',
    // Public Playwright test key; it verifies only the devnet manifest signed for this run's local anvil deployment.
    env: {
      GHOSTPAY_PAGES_DEPLOYMENTS_DIR: state.deploymentsDir,
      GHOSTPAY_RELEASE_PUBKEYS: state.publicKey,
      // Playwright's webServer exports FORCE_COLOR=1; build-pages.sh's `node -p` version probe would then print ANSI
      // escapes and fail its integer test ("node >= 22 required"). Plain output for the build script.
      FORCE_COLOR: '0',
    },
  },
});
