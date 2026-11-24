import { expect, test } from '@playwright/test';
import { merchantIdFor, signMerchantProfile, signerPublicKeyHex } from '@ghostpay/invoice-schema';

const preview = process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] !== 'lean' && process.env['VITE_GHOSTID_OFFLINE_REVIEW'] === '1';
const fileLabel = 'Signed merchant profile file';

function profile(seed: number) {
  const key = new Uint8Array(32).fill(seed);
  const signer = signerPublicKeyHex(key);
  return signMerchantProfile({
    v: 1, merchantId: merchantIdFor(signer), name: 'Harbour Books', signer,
    origins: ['https://books.example'], chains: [1], tokens: ['ETH'], templates: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, key);
}

test('the offline profile picker is absent from the default full and lean builds', async ({ page }) => {
  test.skip(preview, 'This case qualifies the default profiles.');
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
});

test('reviews local files offline and preserves an independently stored origin pin', async ({ page, context }) => {
  test.skip(!preview, 'This case requires the opt-in full GhostID preview.');
  const original = profile(4);
  const other = profile(5);
  const pinName = 'ghostpay.merchantKey.v1:https://books.example';
  const saved = JSON.stringify({ v: 1, signer: original.signer });
  await page.addInitScript(([name, value]: [string, string]) => localStorage.setItem(name, value), [pinName, saved] as [string, string]);
  await page.goto('/');
  await page.getByText('Merchant profile', { exact: true }).click();
  const picker = page.getByLabel(fileLabel);
  await expect(picker).toBeVisible();
  const requests: string[] = [];
  page.on('request', (request) => { requests.push(request.url()); });
  await context.setOffline(true);

  const choose = (input: unknown) => picker.setInputFiles({
    name: 'merchant.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)),
  });
  await choose(original);
  const group = page.getByRole('group', { name: 'Review a merchant profile offline' });
  await expect(group.getByText('Harbour Books')).toBeVisible();
  await expect(group.getByText(original.signer)).toBeVisible();
  await expect(group.getByText('https://books.example')).toBeVisible();
  await expect(group.getByRole('link')).toHaveCount(0);
  const independentKey = group.getByRole('textbox');
  await expect(independentKey).toHaveValue('');
  await independentKey.fill(original.signer.slice(0, 16));
  await expect(group.getByText(/complete 66-character public key/)).toBeVisible();
  await independentKey.fill(original.signer);
  await expect(group.getByText('The profile signer matches the full key you entered.')).toBeVisible();
  await choose(other);
  await expect(group.getByText('This profile was signed by a different key.')).toBeVisible();
  await expect(independentKey).toHaveValue(original.signer);
  await choose({ ...other, name: 'Altered' });
  await expect(group.getByRole('alert')).toBeVisible();
  await expect(group.getByText(other.signer)).toHaveCount(0);
  await group.getByRole('button', { name: 'Clear local review' }).click();
  await expect(picker).toBeFocused();
  await choose(original);
  await expect(independentKey).toHaveValue('');
  expect(await page.evaluate((name) => localStorage.getItem(name), pinName)).toBe(saved);
  expect(requests).toEqual([]);
});
