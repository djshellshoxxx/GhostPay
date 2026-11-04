import { expect, test } from '@playwright/test';
import { decodeAbiParameters, encodeFunctionData } from 'viem';
import { ghostPayRouterAbi, grossForNet, type Address, type Hex } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { makeLog } from '../src/test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../src/test/fakeManifest';
import { configureRpc, mockNetwork } from './flowMocks';
import { generateKeys } from './helpers';

// The same spec runs under both build profiles: lean must not offer (or accept) an unbound manual digest.
const lean = (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full') === 'lean';

test(`receipt creation ${lean ? 'requires a validated invoice (lean)' : 'keeps the manual digest mode (full)'}`, async ({ page, context }) => {
  test.setTimeout(120_000);
  const state: Parameters<typeof mockNetwork>[1] = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await generateKeys(page);
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 120, index: 1, caller: FAKE_ROUTER });
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const topicAddress = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], mine.log.data as Hex);
  const parsed = parseMetadata(metadata);
  if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
  const txHash = mine.log.transactionHash as string;
  const payer = `0x${'7'.repeat(40)}`;
  const transfer = {
    address: parsed.token.toLowerCase(),
    topics: [TRANSFER_TOPIC, topicAddress(payer), topicAddress(mine.stealthAddress)],
    data: `0x${parsed.netAmount.toString(16).padStart(64, '0')}`,
    blockNumber: mine.log.blockNumber,
    blockHash: mine.log.blockHash,
    transactionHash: txHash,
    logIndex: '0x0',
  };
  const common = { to: FAKE_ROUTER, from: payer, blockHash: mine.log.blockHash, blockNumber: mine.log.blockNumber };
  state.logs = [mine.log, transfer];
  state.evidence = {
    txHash,
    transaction: {
      ...common,
      hash: txHash,
      value: '0x0',
      input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [parsed.token, mine.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata] }),
    },
    receipt: { ...common, status: '0x1', transactionHash: txHash, logs: [transfer, mine.log] },
  };

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();

  const panel = page.getByRole('region', { name: 'Seller-signed receipt' });
  await expect(panel).toBeVisible();
  // Invoice binding is offered in both profiles.
  await expect(panel.getByLabel('Signed invoice link or fragment')).toBeVisible();
  const manual = panel.getByLabel('Invoice digest (entered manually)');
  if (lean) {
    await expect(manual).toHaveCount(0);
    await expect(panel).not.toContainText('entered manually and is not matched');
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'only signs receipts bound to a validated signed invoice' })).toBeVisible();
    await expect(page.getByLabel('Signed receipt JSON')).toHaveCount(0);
  } else {
    await expect(manual).toBeVisible();
    await expect(panel).toContainText('The invoice digest is entered manually and is not matched against invoice contents.');
  }
});
