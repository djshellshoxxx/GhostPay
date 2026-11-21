import { expect, test, type Page } from '@playwright/test';
import { appendBlocks, coinbase, mockChain, SEED_A, walletA } from '../src/features/btc/fixtures.testutil';

const lean = (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full') === 'lean';
const consentName = /Also ask the server whether each found output is unspent/;

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bitcoin (test)', exact: true }).click();
  await page.getByLabel('Network', { exact: true }).selectOption('regtest');
  await page.getByLabel(/Esplora server URL/).fill('https://esplora.test/api');
  await page.getByLabel(/Or import a seed/).fill(SEED_A);
  await page.getByRole('button', { name: 'Import seed', exact: true }).click();
}

test('Bitcoin provider requests require consent and stop when consent is revoked', async ({ page, context }) => {
  test.skip(lean, 'The lean profile excludes Bitcoin.');
  const chain = mockChain('regtest', walletA(), { payments: 2 });
  const outpoints: string[] = []; let hold = false; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await context.route('https://esplora.test/api/**', async (route) => {
    const req = route.request(); expect(req.method()).toBe('GET'); expect(req.postData()).toBeNull();
    if (req.url().includes('/outspend/')) { outpoints.push(req.url()); if (hold) await gate; }
    const response = await chain.fetchFn(req.url(), { method: 'GET' });
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, body: await response.text() }).catch(() => undefined);
  });
  await open(page); await page.getByLabel(/First block height/).fill('1');
  const consent = page.getByRole('checkbox', { name: consentName });
  await expect(consent).not.toBeChecked();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/2 unspent payment/)).toBeVisible();
  expect(outpoints).toEqual([]);
  await expect(page.getByText(/No optional per-output spent-status query was sent/)).toBeVisible();
  await consent.check();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/Spent status: the selected Esplora server was asked/)).toBeVisible();
  expect(outpoints).toHaveLength(2);
  expect(new Set(outpoints).size).toBe(2);
  hold = true;
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => outpoints.length).toBe(3);
  await expect(consent).toBeEnabled(); await consent.uncheck(); release();
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/2 unspent payment/)).toBeVisible();
  expect(outpoints).toHaveLength(3);
});

test('Bitcoin incomplete local history remains unknown across reload until the remaining blocks are scanned', async ({ page, context }) => {
  test.skip(lean, 'The lean profile excludes Bitcoin.');
  test.setTimeout(120_000);
  const chain = mockChain('regtest', walletA());
  appendBlocks(chain.blocks, Array.from({ length: 497 }, (_, i) => [coinbase(i + 5)]));
  await context.route('https://esplora.test/api/**', async (route) => {
    const req = route.request(); expect(req.url()).not.toContain('/outspend/');
    const response = await chain.fetchFn(req.url(), { method: 'GET' });
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, body: await response.text() });
  });
  await open(page);
  await page.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }).check();
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toBeEnabled();
  await page.getByLabel(/First block height/).fill('1');
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/Spent status: unknown/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/1 unspent payment/)).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toBeDisabled();
  await expect(page.getByText(/Saved scan: birth height 1, checked through 500, 1 historical matches/)).toBeVisible();
  await open(page);
  await page.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }).check();
  await expect(page.getByText(/Saved scan: birth height 1, checked through 500, 1 historical matches/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/1 unspent payment/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).not.toBeChecked();
  expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
});

test('the lean profile keeps the Bitcoin worker and controls unavailable', async ({ page }) => {
  test.skip(!lean, 'The full profile intentionally includes Bitcoin.');
  const workers: string[] = []; page.on('worker', (worker) => { workers.push(worker.url()); });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitcoin (test)', exact: true })).toHaveCount(0);
  expect(workers).toEqual([]);
});
