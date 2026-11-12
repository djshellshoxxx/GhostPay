import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { prepareManifestFixture } from './e2e/prepare-manifest.mjs';

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // Cloud sandbox symlink to the pre-installed Chromium when the pinned Playwright build is not present.
  '/opt/pw-browsers/chromium',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));
const fixture = prepareManifestFixture();
const profile = process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full';
if (profile !== 'full' && profile !== 'lean') throw new Error('Unknown Playwright build profile.');

// Device projects are Chromium-engine viewport/touch/user-agent emulation ONLY. The descriptors for iPhone SE and
// iPad Mini name WebKit; defaultBrowserType is overridden so only the installed Chromium is needed. This does NOT
// exercise WebKit/Safari rendering or any real device; it checks responsive layout and axe accessibility at those sizes.
const DEVICE_SPECS = [/accessibility\.spec\.ts$/, /devices[^/]*\.spec\.ts$/];
const deviceProject = (name: string, descriptor: (typeof devices)[string] | undefined) => ({
  name,
  testMatch: DEVICE_SPECS,
  use: { ...descriptor, defaultBrowserType: 'chromium' as const },
});

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  ...(profile === 'lean' ? { grepInvert: /embed SDK \((popup mode only|iframe mode)\)/ } : {}),
  reporter: [['list']],
  projects: [
    // Desktop: every existing spec as before; the device-only spec is left to the device projects.
    // The real-anvil journey runs only under playwright.devnet.config.ts (scripts/beta/browser-devnet.sh).
    { name: 'desktop', testIgnore: [/devices[^/]*\.spec\.ts$/, /devnet-journey\.spec\.ts$/] },
    deviceProject('pixel-7-chromium', devices['Pixel 7']),
    deviceProject('iphone-se-chromium', devices['iPhone SE']),
    deviceProject('ipad-mini-chromium', devices['iPad Mini']),
  ],
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
