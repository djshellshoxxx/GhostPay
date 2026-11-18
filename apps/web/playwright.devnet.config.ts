import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { defineConfig } from '@playwright/test';

/*
 * Real-chain browser journey: the built app against a local anvil (see scripts/beta/browser-devnet.sh, which starts
 * anvil, deploys, signs the devnet manifest and then runs this config). Only e2e/devnet-journey.spec.ts runs here; the
 * mocked suite keeps playwright.config.ts. The build goes to its own output directory and port, so it never replaces
 * apps/web/dist or competes with the mocked suite's server on 4173.
 */

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));

const statePath = process.env['GHOSTPAY_DEVNET_STATE'];
const dist = process.env['GHOSTPAY_DEVNET_DIST'];
const port = Number(process.env['GHOSTPAY_DEVNET_WEB_PORT'] ?? '4174');
if (statePath === undefined || dist === undefined || !isAbsolute(dist)) {
  throw new Error('Run scripts/beta/browser-devnet.sh: GHOSTPAY_DEVNET_STATE and an absolute GHOSTPAY_DEVNET_DIST are required.');
}
if (!Number.isSafeInteger(port) || port === 4173 || port < 1024 || port > 65535) throw new Error('Invalid GHOSTPAY_DEVNET_WEB_PORT.');
const state = JSON.parse(readFileSync(statePath, 'utf8')) as { publicKey: string; deploymentsDir: string; chainId: number };
if (state.chainId !== 84532 || !/^0[23][0-9a-f]{64}$/.test(state.publicKey)) throw new Error('Unexpected devnet state file.');

export default defineConfig({
  testDir: './e2e',
  testMatch: /devnet-journey\.spec\.ts$/,
  // Traces/screenshots of a failed run stay with the runner's temp directory, never in the source tree.
  outputDir: `${dist}-results`,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(port)}`,
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath, args: ['--no-sandbox'] } }),
    serviceWorkers: 'block',
    // A stuck action fails within this bound instead of consuming the whole test budget.
    actionTimeout: 30_000,
  },
  webServer: {
    // Same gates as `npm run build` (typecheck, vite build, post-build bundle scan), into a separate output directory.
    command: `npx tsc -p tsconfig.json --noEmit && npx vite build --outDir "${dist}" --emptyOutDir && node e2e/devnet/scan-dist.mjs "${dist}" && npx vite preview --outDir "${dist}" --port ${String(port)} --strictPort --host localhost`,
    url: `http://localhost:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    // Public Playwright test key; it verifies only the devnet manifest signed for this run's local anvil deployment.
    env: {
      GHOSTPAY_RELEASE_PUBKEYS: state.publicKey,
      GHOSTPAY_DEPLOYMENTS_DIR: state.deploymentsDir,
      GHOSTPAY_LOCAL_BUILD_PROFILE: 'full',
    },
  },
});
