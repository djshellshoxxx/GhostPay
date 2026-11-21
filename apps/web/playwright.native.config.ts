import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Supplemental native-engine qualification. Keep the original Chromium configuration and assertions intact.
// Camera fixtures use Chromium fake-capture switches; clipboard fixtures require Chromium permission grants.
// The one CPU-throttling recovery case uses CDP. These remain exercised by the original Chromium gate.
const desktop = base.projects?.find((project) => project.name === 'desktop');
if (desktop === undefined) throw new Error('The original desktop browser project is required.');
const originalIgnore = desktop.testIgnore === undefined ? [] : Array.isArray(desktop.testIgnore) ? desktop.testIgnore : [desktop.testIgnore];
const originalGrepInvert = base.grepInvert === undefined ? [] : Array.isArray(base.grepInvert) ? base.grepInvert : [base.grepInvert];

export default defineConfig({
  ...base,
  outputDir: './test-results/native',
  reporter: [['list'], ['json', { outputFile: 'test-results/native-results.json' }]],
  grepInvert: [
    ...originalGrepInvert,
    /wiping the keys while the master backup KDF runs discards the result: no download/,
  ],
  projects: [
    ...(['firefox', 'webkit'] as const).map((browserName) => ({
      ...desktop,
      name: browserName,
      testIgnore: [...originalIgnore, /qr-camera(?:-multipart)?\.spec\.ts$/, /clipboard-privacy\.spec\.ts$/],
      // Explicitly replace inherited launchOptions so a local Chromium path is never used for another engine.
      use: { browserName, launchOptions: {} },
    })),
    {
      name: 'webkit-iphone-se',
      testMatch: [/accessibility\.spec\.ts$/, /devices[^/]*\.spec\.ts$/],
      use: { ...devices['iPhone SE'], browserName: 'webkit', launchOptions: {} },
    },
    {
      name: 'webkit-ipad-mini',
      testMatch: [/accessibility\.spec\.ts$/, /devices[^/]*\.spec\.ts$/],
      use: { ...devices['iPad Mini'], browserName: 'webkit', launchOptions: {} },
    },
  ],
});
