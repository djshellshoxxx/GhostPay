import { parseFragment } from '@ghostpay/invoice-schema';
import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys } from './helpers';

// Browser acceptance uses the real built full/lean application and UI key import. Playwright controls the clock;
// synthetic lifecycle events and setSystemTime model restoration/suspended timers, not physical OS sleep or BFCache.
const INITIAL_TIME = new Date('2026-11-19T00:00:00Z');
const PASS = 'violet cedar orbit meadow lantern';
const seller = (page: Page) => page.locator('section[aria-labelledby="keys-h"]');
const navigation = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ lockTimeoutMin: 1 }));
  });
  await page.clock.install({ time: INITIAL_TIME });
});

async function importKnownKeys(page: Page): Promise<string> {
  await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  // Public deterministic TEST-ONLY scalars, matching the unit-test fixtures; they never hold funds.
  await seller(page).getByLabel('Spending private key (64 hex characters)').fill('11'.repeat(32));
  await seller(page).getByLabel('Viewing private key (64 hex characters)').fill('22'.repeat(32));
  await seller(page).getByLabel('Invoice-signing private key (optional)', { exact: true }).fill('33'.repeat(32));
  await seller(page).getByRole('button', { name: 'Load keys', exact: true }).click();
  const meta = seller(page).locator('code', { hasText: /^st:eth:0x/ });
  await expect(meta).toBeVisible();
  return (await meta.textContent()) ?? '';
}

async function shiftWallClock(page: Page, delta: number): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  // Unlike fastForward/runFor, setSystemTime neither fires timers nor advances the monotonic elapsed time.
  await page.clock.setSystemTime(now + delta);
}

async function restore(page: Page, event: 'pageshow' | 'focus' | 'visibilitychange' | 'resume'): Promise<void> {
  await page.evaluate((kind) => {
    if (kind === 'pageshow') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    else if (kind === 'focus') window.dispatchEvent(new Event('focus'));
    else document.dispatchEvent(new Event(kind));
  }, event);
}

async function expectWiped(page: Page): Promise<void> {
  await expect(page.getByText(/Seller keys were wiped from memory after 1 minute without activity/)).toBeVisible();
  await expect(seller(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await expect(seller(page).locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);
}

for (const event of ['pageshow', 'focus', 'visibilitychange', 'resume'] as const) {
  test(`expired wall clock locks on simulated ${event} restoration with timers suspended`, async ({ page }) => {
    await page.goto('/');
    await importKnownKeys(page);
    await shiftWallClock(page, 61_000);
    await restore(page, event);
    await expectWiped(page);
  });
}

test('first pointer activity after a long suspension cannot renew the expired session', async ({ page }) => {
  await page.goto('/');
  await importKnownKeys(page);
  await shiftWallClock(page, 61_000);
  await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await expectWiped(page);
  await page.keyboard.press('Shift');
  await restore(page, 'pageshow');
  await expectWiped(page);
});

test('a backwards wall clock locks before the first keyboard activity', async ({ page }) => {
  await page.goto('/');
  await importKnownKeys(page);
  await shiftWallClock(page, -60_000);
  await page.keyboard.press('Shift');
  await expectWiped(page);
});

test('returning through real browser history does not expose the expired keys', async ({ page }) => {
  await page.goto('/');
  await importKnownKeys(page);
  const beforeLeaving = await page.evaluate(() => Date.now());
  await page.goto('about:blank');
  await page.clock.setSystemTime(beforeLeaving + 61_000);
  await page.goBack();
  await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  // Chromium may restore this page from BFCache or perform a fresh load. Either observed path must expose no keys;
  // this test does not claim that BFCache was selected merely because goBack succeeded.
  await expect(seller(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await expect(seller(page).locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);
});

test('valid activity renews the timeout and ordinary inactivity subsequently locks', async ({ page }) => {
  await page.goto('/');
  const metaAddress = await importKnownKeys(page);
  await page.clock.runFor(45_000);
  await page.keyboard.press('Shift');
  await page.clock.runFor(45_000);
  await expect(seller(page).getByText(metaAddress, { exact: true })).toBeVisible();
  await page.clock.runFor(16_000);
  await expectWiped(page);
});

test('activity in one tab does not renew a different tab session', async ({ context, page }) => {
  await page.goto('/');
  const metaAddress = await importKnownKeys(page);
  const other = await context.newPage();
  try {
    await other.goto('/');
    await importKnownKeys(other);
    // Playwright's clock is shared by this context, as a system clock is; activity timestamps remain tab-local.
    await page.clock.runFor(45_000);
    await page.bringToFront();
    await page.keyboard.press('Shift');
    await page.clock.runFor(16_000);
    await expect(seller(page).getByText(metaAddress, { exact: true })).toBeVisible();
    await expectWiped(other);
    await page.clock.runFor(45_000);
    await expectWiped(page);
  } finally {
    await other.close();
  }
});

test('authorized encrypted-vault unlock receives a new inactivity deadline', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const metaAddress = await importKnownKeys(page);
  await seller(page).getByLabel('New vault passphrase (14+ characters)').fill(PASS);
  await seller(page).getByLabel('Repeat vault passphrase').fill(PASS);
  await seller(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(seller(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });
  await shiftWallClock(page, 61_000);
  await restore(page, 'focus');
  await expectWiped(page);
  await seller(page).getByLabel('Vault passphrase', { exact: true }).fill(PASS);
  await seller(page).getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(seller(page).getByText(metaAddress, { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(seller(page).getByLabel('Vault passphrase', { exact: true })).toHaveValue('');
  await page.clock.runFor(30_000);
  await expect(seller(page).getByText(metaAddress, { exact: true })).toBeVisible();
  await shiftWallClock(page, 31_000);
  await restore(page, 'pageshow');
  await expectWiped(page);
});

test('a sole copy remains available only for encrypted backup until normal vault unlock', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const metaAddress = await generateKeys(page);
  await shiftWallClock(page, 61_000);
  await restore(page, 'focus');
  await expect(page.getByText('Session locked after inactivity')).toBeVisible();
  await expect(navigation(page).getByRole('button', { name: 'Create invoice', exact: true })).toBeDisabled();
  await expect(seller(page).getByRole('button', { name: 'Download encrypted keystore' })).toBeVisible();
  await expect(seller(page).getByRole('button', { name: 'Verify backup', exact: true })).toBeVisible();
  await page.keyboard.press('Shift');
  await expect(navigation(page).getByRole('button', { name: 'Create invoice', exact: true })).toBeDisabled();
  await seller(page).getByLabel('Repeat passphrase', { exact: true }).fill('newly typed recovery passphrase must expire');
  await shiftWallClock(page, 61_000);
  await restore(page, 'focus');
  await expect(seller(page).getByLabel('Repeat passphrase', { exact: true })).toHaveValue('');
  await expect(navigation(page).getByRole('button', { name: 'Create invoice', exact: true })).toBeDisabled();

  // Creating an encrypted backup must not silently resume spending/signing. A later normal unlock proves the
  // passphrase and establishes a fresh session, while the exact public identity demonstrates no sole-copy loss.
  await seller(page).getByLabel('New vault passphrase (14+ characters)').fill(PASS);
  await seller(page).getByLabel('Repeat vault passphrase').fill(PASS);
  await seller(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(seller(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(navigation(page).getByRole('button', { name: 'Create invoice', exact: true })).toBeDisabled();
  await seller(page).getByRole('button', { name: 'Wipe keys from memory', exact: true }).click();
  await expect(seller(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await seller(page).getByLabel('Vault passphrase', { exact: true }).fill(PASS);
  await seller(page).getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(seller(page).getByText(metaAddress, { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(navigation(page).getByRole('button', { name: 'Create invoice', exact: true })).toBeEnabled();
});

for (const elapsedMs of [59_999, 60_000, 60_001]) {
  test(`first invoice signature after sleep at ${elapsedMs} ms`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
    const keys = seller(page);
    await keys.getByRole('button', { name: 'Generate new keys' }).click();
    await keys.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(PASS);
    await keys.getByLabel('Repeat passphrase', { exact: true }).fill(PASS);
    const download = page.waitForEvent('download');
    await keys.getByRole('button', { name: 'Download encrypted keystore' }).click();
    const file = await (await download).path();
    await keys.getByLabel('Downloaded keystore file', { exact: true }).setInputFiles(file);
    await keys.getByLabel('Keystore passphrase', { exact: true }).fill(PASS);
    await keys.getByRole('button', { name: 'Verify backup', exact: true }).click();
    await expect(keys.getByText(/^Backup verified: the file decrypts and holds exactly the loaded keys/)).toBeVisible({ timeout: 60_000 });

    const identity = await keys.locator('code', { hasText: /^st:eth:0x/ }).innerText();
    await navigation(page).getByRole('button', { name: 'Create invoice', exact: true }).click();
    await page.getByLabel('Token amount').fill('0.5');
    await page.getByLabel('Item 1 description').fill('Test item');
    await page.getByLabel('Item 1 unit price').fill('1.00');

    // Establish the last activity at an exact instant and leave browser timers paused through the activation.
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 5_000)));
    await page.keyboard.press('Shift');
    await shiftWallClock(page, elapsedMs);
    await page.getByRole('button', { name: 'Create invoice link' }).dispatchEvent('click');
    const link = page.getByRole('textbox', { name: 'Link', exact: true });
    if (elapsedMs < 60_000) {
      await expect(link).toHaveValue(/#gpi=v1\./);
    } else {
      await expect(page.getByText(/Seller keys were wiped from memory.*Load them again/)).toBeVisible();
      await expect(link).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Create invoice link' })).toHaveCount(0);
    }

    if (elapsedMs === 60_000) {
      await page.clock.resume();
      await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
      await keys.getByText('Import an encrypted keystore', { exact: true }).click();
      await keys.getByLabel('Keystore file', { exact: true }).setInputFiles(file);
      await keys.getByLabel('Passphrase', { exact: true }).fill(PASS);
      await keys.getByRole('button', { name: 'Decrypt and load' }).click();
      await expect(keys.getByText(identity, { exact: true })).toBeVisible({ timeout: 60_000 });
      const issued = await parseFragment(new URL(await createInvoice(page)).hash);
      expect(issued.verification.signatureValid).toBe(true);
      expect(issued.invoice.metaAddress).toBe(identity);
    }
  });
}
