// Animated multi-part QR through Chromium's virtual camera: device A creates a real signed invoice, the test renders
// it as GPQ1 parts into the fake-capture file, device B scans the looping parts. Not physical-device acceptance.
import { expect, test } from '@playwright/test';
import { encodeMultipart } from '@ghostpay/qr-exchange';
import { cameraLaunchOptions } from './camera-browser';
import { createInvoice, generateKeys } from './helpers';
import { rewriteQrVideo, writeQrVideo } from './qr-video.mjs';

const VIDEO = writeQrVideo(['placeholder: replaced before scanning']);
test.use({ launchOptions: cameraLaunchOptions(VIDEO) });

test('a multi-part invoice QR is assembled from looping parts, previewed locally and opens only the ordinary review', async ({ browser }) => {
  const ctxA = await browser.newContext({ serviceWorkers: 'block' });
  const a = await ctxA.newPage();
  await a.goto('/');
  await generateKeys(a);
  const link = await createInvoice(a, { memo: 'Delivered in two phases; see attached schedule.' });
  await ctxA.close();

  // Pay accepts https links at its own host or the bare fragment; this preview server is http://localhost, so the
  // parts carry the fragment. Small parts force several codes; the video loops, so a missed part is caught later.
  const fragment = link.slice(link.indexOf('#'));
  const parts = encodeMultipart(Uint8Array.from(new TextEncoder().encode(fragment)), { chunkChars: 200 });
  expect(parts.length).toBeGreaterThan(3);
  rewriteQrVideo(VIDEO, parts, { framesPerCode: 6, blankFrames: 2 });

  const ctxB = await browser.newContext({ serviceWorkers: 'block', permissions: ['camera'] });
  const b = await ctxB.newPage();
  const requests: string[] = [];
  b.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) requests.push(r.url()); });
  await b.goto('/');
  await b.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Pay$/ }).click();
  await b.getByText('Scan an invoice QR').click();
  const region = b.getByRole('region', { name: 'Invoice QR import' });
  await region.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(region.getByRole('progressbar')).toBeVisible({ timeout: 20_000 });
  await expect(b.getByRole('heading', { name: 'Review scanned invoice' })).toBeVisible({ timeout: 45_000 });
  // The camera stops once the transfer completes.
  await expect.poll(() => b.evaluate(() => Array.from(document.querySelectorAll('video')).some((v) => v.srcObject instanceof MediaStream && v.srcObject.getVideoTracks().some((t) => t.readyState === 'live')))).toBe(false);
  await expect(b.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
  await b.getByRole('button', { name: 'Open scanned invoice' }).click();
  await expect(b.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  expect(requests).toEqual([]);
  await ctxB.close();
});
