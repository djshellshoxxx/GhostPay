import { expect, test } from '@playwright/test';

import { generateKeys } from './helpers';

test('public seller config exports on one device and previews on another without applying anything', async ({ browser }) => {
  const a = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await a.goto('/');
  const meta = await generateKeys(a);
  const text = await a.getByLabel('Same config as text').inputValue();
  expect(text).toContain(meta);
  expect(text).not.toMatch(/secret|spending[A-Za-z]*Key|"viewing/i);
  await expect(a.locator('[data-qr-kind="device"]')).toBeVisible();
  await expect(a.getByText('Moving secret keys is separate')).toBeVisible();

  const b = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await b.goto('/');
  await b.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  const pairing = b.locator('section[aria-labelledby="pairing-h"]');
  await pairing.getByLabel('Or paste QR text').fill(text.replace('"v":1', '"v":2'));
  await pairing.getByRole('button', { name: 'Use pasted text' }).click();
  await expect(pairing.getByText('That QR text was not accepted. Check it and try again.')).toBeVisible();
  await pairing.getByLabel('Or paste QR text').fill(text);
  await pairing.getByRole('button', { name: 'Use pasted text' }).click();
  await expect(pairing.getByText('Received config (untrusted preview)')).toBeVisible();
  await expect(pairing.locator('code', { hasText: meta })).toBeVisible();
  await expect(pairing.getByText(/No keys are loaded here/)).toBeVisible();
  // Nothing was applied: this device still has no keys.
  await expect(b.getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});
