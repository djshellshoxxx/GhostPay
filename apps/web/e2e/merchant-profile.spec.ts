import { expect, test } from '@playwright/test';
import { merchantIdFor, signMerchantProfile, signerPublicKeyHex, parseFragment } from '@ghostpay/invoice-schema';

const ORIGIN = 'https://merchant.test';
function profile(byte: number, amountMinor = '9007199254740993123456') {
  const key = new Uint8Array(32).fill(byte);
  const signer = signerPublicKeyHex(key);
  return signMerchantProfile({ v: 1, merchantId: merchantIdFor(signer), name: 'Browser merchant', signer, chains: [84532], tokens: ['USDC'], templates: [{ id: 'large', amountMinor, currency: 'USD', expires: 1800 }], origins: [ORIGIN], exp: Math.floor(Date.now() / 1000) + 3600 }, key);
}

// This prefix is excluded by the existing lean-profile filter: the lean artifact omits the merchant panel and SDK.
test.describe('embed SDK (popup mode only): merchant profile UI', () => {
  test('loads only on consent, preserves exact templates and detects a changed key in a second tab', async ({ page, context }) => {
    const original = profile(5);
    const rotated = profile(6);
    let requests = 0;
    await context.route(`${ORIGIN}/**`, async (route) => {
      requests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route.request().url().endsWith('/rotated') ? rotated : original) });
    });
    await page.goto(`/?gpmu=${encodeURIComponent(`${ORIGIN}/profile`)}&gpt=large`);
    await expect(page.getByRole('button', { name: 'Load profile' })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'Load profile' }).click();
    await expect(page.getByText('9007199254740993123456')).toBeVisible();
    expect(requests).toBe(1);
    await page.getByLabel('Enter the full signer public key verified through an independent channel').fill(original.signer);
    await page.getByRole('button', { name: 'Remember verified key for this origin' }).click();
    await expect(page.getByText('Profile key matches your saved key for this origin.')).toBeVisible();

    const second = await context.newPage();
    await second.goto(`/?gpmu=${encodeURIComponent(`${ORIGIN}/rotated`)}`);
    expect(requests).toBe(1);
    await second.getByRole('button', { name: 'Load profile' }).click();
    await expect(second.getByText(/This origin now presents a different key/)).toBeVisible();
    await expect(second.getByRole('button', { name: 'Remember verified key for this origin' })).toHaveCount(0);
    await expect(page.getByText('Profile key matches your saved key for this origin.')).toBeVisible();
    await second.getByRole('checkbox', { name: /forgetting this key removes change detection/ }).check();
    await second.getByRole('button', { name: 'Forget the previously saved key' }).click();
    await expect(page.getByText('Profile key matches your saved key for this origin.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remember verified key for this origin' })).toBeVisible();
  });
  test('matching merchant keys issue a separate exact-template invoice without changing payer requests', async ({ page }) => {
    const merchant = profile(5, '50000');
    await page.route(`${ORIGIN}/profile`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(merchant) });
    });
    await page.goto(`/?gpmu=${encodeURIComponent(`${ORIGIN}/profile`)}&gpt=large`);
    await page.getByRole('button', { name: 'Load profile' }).click();
    await expect(page.getByText('50000', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign a new invoice from this template' })).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys', exact: true }).click();
    await page.getByText('Import existing keys (hex)', { exact: true }).click();
    await page.getByLabel('Spending private key (64 hex characters)').fill('01'.repeat(32));
    await page.getByLabel('Viewing private key (64 hex characters)').fill('02'.repeat(32));
    await page.getByLabel('Invoice-signing private key (optional)', { exact: true }).fill('05'.repeat(32));
    await page.getByRole('button', { name: 'Load keys', exact: true }).click();
    await page.getByText('Create a merchant invoice from this template', { exact: true }).click();
    await page.getByLabel('Fixed token amount to charge').fill('1.25');
    await page.getByRole('button', { name: 'Sign a new invoice from this template' }).click();
    const output = page.getByLabel('New signed invoice link');
    await expect(output).toBeVisible();
    const parsed = await parseFragment(new URL(await output.inputValue()).hash);
    expect(parsed.verification.signatureValid).toBe(true);
    expect(parsed.invoice.signer).toBe(merchant.signer);
    expect(parsed.invoice.fiat).toEqual({ currency: 'USD', minorUnits: '50000' });
    expect(parsed.invoice.amountPolicy).toEqual({ mode: 'fixed_token', tokenAmount: '1250000' });
    expect(parsed.invoice.expiresAt - parsed.invoice.quote.timestamp).toBe(1800);
    await page.getByLabel('Fixed token amount to charge').fill('2');
    await expect(output).toHaveCount(0);
  });

});
