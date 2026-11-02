import { expect, test, type Page } from '@playwright/test';
import { keccak256 } from 'viem';
import { generateKeys } from './helpers';
import { DESTINATION, installSweepNetwork, readSweepJournal, SWEEP_RPC } from './sweep-network';

// Real production-cost vault KDF on save, action step-up and reload unlock. No KDF/signing substitution.
test.setTimeout(180_000);
const slowExpect = expect.configure({ timeout: 30_000 });
const PASS = 'violet comet maple lantern harbor';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const keys = (page: Page) => page.locator('section[aria-labelledby="keys-h"]');
const sweep = (page: Page) => page.locator('section[aria-labelledby="sw-h"]');
const sign = (page: Page) => sweep(page).getByRole('button', { name: 'Sign and broadcast directly' });
// A successful send also renders a separate Submitted summary. Check the durable attempt card, identified by its
// read-only status control, rather than choosing an arbitrary matching title/hash. Notice titles include an icon/colon.
const pendingAttempt = (page: Page) => sweep(page).getByRole('note').filter({
  has: page.getByRole('button', { name: 'Check status', exact: true }),
});

async function scanToSweep(page: Page, owner: string): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();
  const match = page.locator('section[aria-labelledby="scan-h"] .matches > li').filter({
    has: page.getByRole('button', { name: 'Sweep this payment' }),
  });
  await expect(match).toHaveCount(1);
  await expect(match.getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(owner);
  await expect(page.getByText(/Claimed, not confirmed/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Sweep this payment' }).click();
  await expect(sweep(page).getByText('5 USDC', { exact: true })).toBeVisible();
  await sweep(page).getByLabel(/Directly/).check();
}

for (const outcome of ['success', 'unknown'] as const) {
  test(`actual direct sweep journals before ${outcome} handoff and refuses a duplicate through reload`, async ({ context, page }) => {
    const network = await installSweepNetwork(context, page, outcome);
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    await page.addInitScript((rpc) => {
      localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
    }, SWEEP_RPC);
    await page.goto('/');
    const meta = await generateKeys(page);
    await keys(page).getByLabel('New vault passphrase (14+ characters)').fill(PASS);
    await keys(page).getByLabel('Repeat vault passphrase').fill(PASS);
    await keys(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
    await slowExpect(keys(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible();
    const mine = network.setPayment(meta);
    await scanToSweep(page, mine.stealthAddress);
    expect(workers.some((url) => /\/assets\/scanner\.worker-/.test(url))).toBe(true);
    await sweep(page).getByLabel('Destination address (your own wallet)').fill(DESTINATION);
    await sweep(page).getByLabel('Vault passphrase (required for each sweep action)').fill(PASS);
    await expect(sign(page)).toBeEnabled();
    await sign(page).click();
    // The route deliberately holds the real signed raw transaction while the UI is busy and the journal is durable.
    await slowExpect.poll(() => network.state.handoffLocks.length).toBe(1);
    await expect(sign(page)).toBeDisabled();
    await sign(page).dispatchEvent('click');
    expect(network.state.raws).toHaveLength(1);
    // The route publishes its lock before asynchronous signer recovery finishes. Wait for the held response itself.
    await slowExpect.poll(() => network.state.releaseBroadcast !== undefined).toBe(true);
    const releaseBroadcast = network.state.releaseBroadcast;
    if (releaseBroadcast === undefined) throw new Error('Raw broadcast hold was not ready');
    releaseBroadcast();
    const title = outcome === 'success' ? 'Submitted' : 'Outcome unknown';
    await slowExpect(pendingAttempt(page)).toHaveCount(1);
    await expect(pendingAttempt(page).locator('.notice-title')).toContainText(title);
    const raw = network.state.raws[0];
    if (raw === undefined) throw new Error('Expected actual signed raw transaction');
    const expectedHash = keccak256(raw);
    const broadcastRequests = network.state.raws.length;
    expect(new Set(network.state.raws).size).toBe(1); // Transport retries can only repeat the identical signed bytes.
    await expect(pendingAttempt(page).locator('code')).toHaveText(expectedHash);
    await expect(sign(page)).toBeDisabled();
    await expect(sweep(page).getByLabel('Vault passphrase (required for each sweep action)')).toHaveValue('');
    await expect.poll(() => readSweepJournal(page)).toMatchObject([{ nonce: 0, expectedHash, status: outcome === 'success' ? 'submitted' : 'unknown-after-handoff' }]);
    await sweep(page).getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(sweep(page).getByRole('button', { name: 'Check status', exact: true })).toBeEnabled();
    await expect(sign(page)).toBeDisabled(); // An absent receipt does not erase the lock.

    await page.reload();
    await nav(page).getByRole('button', { name: 'Seller keys' }).click();
    await keys(page).getByLabel('Vault passphrase', { exact: true }).fill(PASS);
    await keys(page).getByRole('button', { name: 'Unlock saved vault' }).click();
    await slowExpect(keys(page).locator('code', { hasText: meta })).toBeVisible();
    await nav(page).getByRole('button', { name: 'Sweep', exact: true }).click();
    await expect(page.getByText('Choose a payment to sweep from Scan and receive.', { exact: true })).toBeVisible();
    // Reload retains neither a selected match nor hidden scan history. Re-establish it with an explicit built Worker scan.
    await scanToSweep(page, mine.stealthAddress);
    await expect(pendingAttempt(page)).toHaveCount(1);
    await expect(pendingAttempt(page).locator('.notice-title')).toContainText(title);
    await expect(pendingAttempt(page).locator('code')).toHaveText(expectedHash);
    await sweep(page).getByLabel('Destination address (your own wallet)').fill(DESTINATION);
    await expect(sign(page)).toBeDisabled();
    await sign(page).dispatchEvent('click');
    expect(network.state.raws).toHaveLength(broadcastRequests);
    await expect.poll(() => readSweepJournal(page)).toMatchObject([{ nonce: 0, expectedHash }]);

    network.state.mined = true;
    await sweep(page).getByRole('button', { name: 'Check status', exact: true }).click();
    const included = sweep(page).getByRole('note').filter({
      has: page.locator('.notice-title', { hasText: 'Included on chain' }),
    });
    await expect(included).toHaveCount(1);
    await expect(included.locator('.notice-title')).toContainText('Included on chain');
    await expect(included.locator('code')).toHaveText(expectedHash);
    await expect.poll(() => readSweepJournal(page)).toMatchObject([{ nonce: 0, expectedHash, status: 'included' }]);
    expect(network.state.raws).toHaveLength(broadcastRequests);
    expect(network.state.handoffLocks).toHaveLength(broadcastRequests);
    expect(network.state.methods).toContain('eth_estimateGas');
    expect(network.state.methods).toContain('eth_call');
    expect(network.state.unexpected).toEqual([]);
  });
}
