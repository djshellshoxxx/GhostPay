// Virtual-camera QR scanning in real Chromium. Each describe launches its own browser with a fake capture file.
// This is browser-engine automation, not physical-device acceptance (see docs/qr/PHYSICAL_DEVICE_ACCEPTANCE.md).
import { expect, test, type Page } from '@playwright/test';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { exportSellerPairing } from '@ghostpay/qr-exchange';
import { cameraLaunchOptions } from './camera-browser';
import { writeQrVideo } from './qr-video.mjs';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const keys = generateKeySet();
const META = encodeMetaAddress({ spendingPublicKey: keys.spendingPublicKey, viewingPublicKey: keys.viewingPublicKey });
const SIGNER = hex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true));
const PAIRING = exportSellerPairing({ metaAddress: META, signerPublicKey: SIGNER }, [], []);
// launchOptions is worker-scoped, so it must be top-level; camera permission is per context below.
test.use({ launchOptions: cameraLaunchOptions(writeQrVideo([PAIRING])) });

async function openPairing(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  return page.locator('section[aria-labelledby="pairing-h"]');
}
async function liveTracks(page: Page): Promise<number> {
  return page.evaluate(() => Array.from(document.querySelectorAll('video')).reduce((n, v) => {
    const s = v.srcObject;
    return n + (s instanceof MediaStream ? s.getVideoTracks().filter((t) => t.readyState === 'live').length : 0);
  }, 0));
}

test.describe('virtual camera: single QR', () => {
  test.use({ permissions: ['camera'] });

  test('camera starts only on click, decodes the public seller config, previews it untrusted and stops the camera', async ({ page }) => {
    const pairing = await openPairing(page);
    expect(await liveTracks(page)).toBe(0);
    await pairing.getByRole('button', { name: 'Scan with camera' }).click();
    await expect(pairing.getByText('Received config (untrusted preview)')).toBeVisible({ timeout: 20_000 });
    await expect(pairing.locator('code', { hasText: META })).toBeVisible();
    await expect.poll(() => liveTracks(page)).toBe(0);
    // Nothing was applied: this device still has no keys.
    await expect(page.getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  });

  test('stopping, navigating away and reopening never leaves a live camera track', async ({ page }) => {
    const pairing = await openPairing(page);
    await pairing.getByRole('button', { name: 'Scan with camera' }).click();
    await pairing.getByRole('button', { name: 'Stop camera' }).click();
    await expect.poll(() => liveTracks(page)).toBe(0);
    await pairing.getByRole('button', { name: 'Scan with camera' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Pay$/ }).click();
    await expect.poll(() => liveTracks(page)).toBe(0);
    const reopened = await openPairing(page);
    await expect(reopened.getByRole('button', { name: 'Scan with camera' })).toBeVisible();
    expect(await liveTracks(page)).toBe(0);
  });
});

test.describe('virtual camera: permission denied', () => {
  // No camera permission granted and no fake-UI auto-accept: headless Chromium denies the request.
  test.use({ permissions: [] });

  test('a denied camera falls back to paste with a clear message and no preview', async ({ page }) => {
    const pairing = await openPairing(page);
    await pairing.getByRole('button', { name: 'Scan with camera' }).click();
    await expect(pairing.getByText(/Camera access was denied/)).toBeVisible({ timeout: 20_000 });
    await expect(pairing.getByText('Received config (untrusted preview)')).toHaveCount(0);
    expect(await liveTracks(page)).toBe(0);
    await pairing.getByLabel('Or paste QR text').fill(PAIRING);
    await pairing.getByRole('button', { name: 'Use pasted text' }).click();
    await expect(pairing.getByText('Received config (untrusted preview)')).toBeVisible();
  });
});
