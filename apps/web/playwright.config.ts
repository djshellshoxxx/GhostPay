import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { prepareManifestFixture } from './e2e/prepare-manifest.mjs';

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));
const fixture = prepareManifestFixture();
const profile = process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full';
if (profile !== 'full' && profile !== 'lean') throw new Error('Unknown Playwright build profile.');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  ...(profile === 'lean' ? { grepInvert: /embed SDK \(popup mode only\)/ } : {}),
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath, args: ['--no-sandbox'] } }),
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host localhost',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 180_000,
    // This public key verifies only the ephemeral, authored fake E2E manifest. It is scoped to Playwright's build process;
    // production builds receive no release key unless an operator explicitly configures one.
    env: {
      GHOSTPAY_RELEASE_PUBKEYS: fixture.publicKey,
      GHOSTPAY_DEPLOYMENTS_DIR: fixture.directory,
      GHOSTPAY_LOCAL_BUILD_PROFILE: profile,
    },
  },
});
