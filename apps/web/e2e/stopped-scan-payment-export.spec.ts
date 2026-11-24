import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { toHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import { RPC, configureRpc, mockNetwork, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { generateKeys } from './helpers';

const VAULT_PASS = 'synthetic vault plum meadow candle';
const EXPORT_PASS = 'synthetic export fern cobalt lantern';
const CHAIN_ID = 84532;

interface StandaloneDecoder {
  decryptKeypairFile(text: string, pass: string, options: { expectedChainId: number }): Promise<{
    header: { scope: string };
    payments: { privateKey: Uint8Array }[];
  }>;
}

test('a cancelled scan can export the selected payment keypair after vault reauthentication', async ({ page, context }) => {
  test.setTimeout(120_000);
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const { mine } = stageVerifiedErc20Payment(state, await generateKeys(page));
  await page.getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
  await page.getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
  await page.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(page.getByRole('main').getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });

  // The fixture head is 500 and its finality depth is 100. Hold the checkpoint read
  // at 400 after the payment row is published, so Cancel always acts on a live scan.
  let checkpointHeld = false;
  let release!: () => void;
  const resume = new Promise<void>((resolve) => { release = resolve; });
  const codeReads: unknown[][] = [];
  let stopped = false;
  await context.route(`${RPC}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      const { method, params } = route.request().postDataJSON() as { method: string; params: unknown[] };
      if (method === 'eth_getBlockByNumber' && params[0] === '0x190') {
        checkpointHeld = true;
        await resume;
      }
      if (stopped && method === 'eth_getCode') codeReads.push(params);
    }
    await route.fallback();
  });

  const scan = page.locator('section[aria-labelledby="scan-h"]');
  const row = scan.locator('.matches > li').filter({ hasText: mine.stealthAddress });
  const address = row.getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive' }).click();
  await scan.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await scan.getByLabel('Start block').fill('0');
  await scan.getByRole('button', { name: 'Start scan' }).click();
  let selectedAddress: string;
  try {
    await expect(address).toHaveText(mine.stealthAddress);
    selectedAddress = await address.innerText();
    await expect.poll(() => checkpointHeld).toBe(true);
    await scan.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    release();
  }
  await expect(scan.getByText(/^Cancelled\./)).toBeVisible();
  await expect(scan.getByRole('button', { name: 'Start scan' })).toBeEnabled();
  stopped = true;

  const toggle = row.getByRole('button', { name: 'Payment details', exact: true });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const details = row.getByRole('region', { name: 'Payment details' });
  const submit = details.getByRole('button', { name: 'Download encrypted keypair' });
  await expect(submit).toBeDisabled();
  await details.getByRole('radio', { name: 'Use the encrypted vault in this browser' }).check();
  await details.getByLabel('Passphrase of your encrypted vault').fill(VAULT_PASS);
  await details.getByLabel('New passphrase for the export file (at least 14 characters)').fill(EXPORT_PASS);
  await details.getByLabel('Repeat the export file passphrase').fill(EXPORT_PASS);
  expect(codeReads).toHaveLength(0);
  const [download] = await Promise.all([page.waitForEvent('download'), submit.click()]);
  expect(download.suggestedFilename()).toBe('ghostpay-stealth-keypair.json');
  expect(codeReads).toHaveLength(1);
  const [account, block] = codeReads[0] ?? [];
  expect(String(account).toLowerCase()).toBe(selectedAddress.toLowerCase());
  expect(block).toBe('latest');

  const decoder = await import(new URL('../../../scripts/recovery/stealth-export-recover.mjs', import.meta.url).href) as StandaloneDecoder;
  const opened = await decoder.decryptKeypairFile(await readFile(await download.path(), 'utf8'), EXPORT_PASS, { expectedChainId: CHAIN_ID });
  try {
    expect(opened.header.scope).toBe('single');
    expect(opened.payments.length).toBe(1);
    const payment = opened.payments[0];
    if (payment === undefined) throw new Error('Missing payment in the single-keypair export');
    expect(privateKeyToAddress(toHex(payment.privateKey)).toLowerCase()).toBe(selectedAddress.toLowerCase());
  } finally {
    for (const payment of opened.payments) payment.privateKey.fill(0);
  }
});
