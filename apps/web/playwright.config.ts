import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));
const e2eDeploymentsDir = fileURLToPath(new URL('./e2e/fixtures/', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath, args: ['--no-sandbox'] } }),
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --host localhost',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 180_000,
    // This public key verifies only the checked-in fake E2E manifest. It is scoped to Playwright's build process;
    // production builds receive no release key unless an operator explicitly configures one.
    env: {
      GHOSTPAY_RELEASE_PUBKEYS: '021ff10be221c7b140505038042f5cc86530e9851a0e6c70ee16c18268768c2e02',
      GHOSTPAY_DEPLOYMENTS_DIR: e2eDeploymentsDir,
    },
  },
});
