import { expect, test, type Worker } from '@playwright/test';
import { mockChain, SEED_A, walletA } from '../src/features/btc/fixtures.testutil';

const lean = (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full') === 'lean';

test('Bitcoin native worker cancels, resumes encrypted checkpoints, and never selects restored matches', async ({ page, context }) => {
  test.skip(lean, 'The lean profile excludes Bitcoin.');
  const chain = mockChain('regtest', walletA());
  let hold = true; let held = false; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const workers: Worker[] = []; const closed = new Set<Worker>();
  page.on('worker', (worker) => { workers.push(worker); worker.on('close', () => { closed.add(worker); }); });
  const errors: string[] = [];
  page.on('pageerror', (error) => { errors.push(error.message); });
  await context.route('https://esplora.test/api/**', async (route) => {
    const req = route.request();
    expect(req.method()).toBe('GET'); expect(req.postData()).toBeNull();
    expect(req.url()).not.toContain(SEED_A);
    if (hold && req.url().includes(`/block/${chain.blocks[2]!.hash}/txs/`)) { held = true; await gate; }
    const response = await chain.fetchFn(req.url(), { method: req.method() });
    // A route held across Worker.terminate may already have been canceled by Chromium.
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, body: await response.text() }).catch(() => undefined);
  });
  const open = async (): Promise<void> => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bitcoin (test)', exact: true }).click();
    await page.getByLabel('Network', { exact: true }).selectOption('regtest');
    await page.getByLabel(/Esplora server URL/).fill('https://esplora.test/api');
    await page.getByLabel(/Or import a seed/).fill(SEED_A);
    await page.getByRole('button', { name: 'Import seed', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }).check();
    await expect(page.getByRole('button', { name: 'Scan', exact: true })).toBeEnabled();
  };
  await open();
  await page.getByLabel(/First block height/).fill('1');
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => held).toBe(true); expect(workers).toHaveLength(1);
  await expect(page.getByText(/Saved scan: birth height 1, checked through 1, 0 historical matches/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => closed.has(workers[0]!)).toBe(true);
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
  chain.requests.length = 0; hold = false; release();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/1 unspent payment/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).not.toBeChecked();
  await expect(page.getByText(/Saved scan: birth height 1, checked through 4, 1 historical matches/)).toBeVisible();
  expect(chain.requests).not.toContain('GET /block-height/1');
  await expect.poll(() => workers.length).toBe(2); await expect.poll(() => closed.has(workers[1]!)).toBe(true);
  await open();
  await expect(page.getByText(/Saved scan: birth height 1, checked through 4, 1 historical matches/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
  chain.requests.length = 0;
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/1 unspent payment/)).toBeVisible();
  expect(chain.requests).toContain('GET /block-height/3');
  expect(chain.requests).not.toContain('GET /block-height/1');
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).not.toBeChecked();
  expect(workers).toHaveLength(3); expect(errors).toEqual([]);
});
