import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Chromium is pre-installed in this environment; never run `playwright install`.
const CANDIDATES = [
  process.env['GHOSTPAY_CHROMIUM'],
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter((p): p is string => typeof p === 'string');
const executablePath = CANDIDATES.find((p) => existsSync(p));

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
  },
});
