import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Exercise the existing Pages fixture and wallet assertions in each mobile engine.
// Chromium video capture switches must never be passed to WebKit.
function mobile(name: string, device: string, browserName: 'chromium' | 'webkit') {
  const descriptor = devices[device];
  if (descriptor === undefined) throw new Error(`Missing mobile device descriptor: ${device}`);
  const testMatch = [/devices\.spec\.ts$/, /devices-mobile-workflows\.spec\.ts$/, /devices-mobile-restore\.spec\.ts$/, /flows\.spec\.ts$/, /browser-checks\.spec\.ts$/];
  if (browserName === 'chromium') testMatch.push(/qr-camera\.spec\.ts$/);
  return {
    name,
    testMatch,
    // The browser self-check spec runs whole: its probes (secure context, WebCrypto, storage, IndexedDB) differ per engine.
    grep: [/devices[^/]*\.spec\.ts/, /browser-checks\.spec\.ts/, /virtual camera: /, /pays a native invoice:/, /refuses a changed wallet account/, /refuses when the wallet mutates/],
    use: {
      ...descriptor,
      browserName,
      ...(browserName === 'webkit' ? { launchOptions: {} } : {}),
    },
  };
}

export default defineConfig({
  ...base,
  outputDir: './test-results/mobile',
  projects: [
    mobile('android-phone-chromium', 'Pixel 7', 'chromium'),
    mobile('android-tablet-chromium', 'Galaxy Tab S4', 'chromium'),
    mobile('iphone-webkit', 'iPhone SE', 'webkit'),
    mobile('ipad-webkit', 'iPad Mini', 'webkit'),
  ],
});
