// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ghostPayRouterAbi, grossForNet, type Address, type Hex, type LogFilter } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';
import { RECONCILIATION_LEDGER_DATA_KEY } from '../lib/reconciliationLedger';
import { createCurrentReconciliationVault, type ReconciliationVaultStore } from '../lib/reconciliationVault';
import { checkpointKeyId } from '../lib/scanClient';
import { captureSessionGuard, clearSession, generateSession, revealViewingKey } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { makeLog } from '../test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, memoryCheckpoints, renderApp } from '../test/render';

const NOW_MS = 1_800_000_000_000;
const CHAIN_ID = 84532;
const TOKEN = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address: string): string => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
let vaultData = new Map<string, string>();

// Keep the actual encryption, evidence handling and guarded CAS writes; replace only the storage backend.
vi.mock('../lib/reconciliationVault', async (original) => {
  const actual = await original<typeof import('../lib/reconciliationVault')>();
  return { ...actual, createCurrentReconciliationVault: async (chainId: number, sellerKeyId: string) => {
    const store: ReconciliationVaultStore = {
      read: (key) => Promise.resolve(vaultData.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => {
        guard();
        if ((vaultData.get(key) ?? null) !== expected) return Promise.resolve(false);
        vaultData.set(key, next);
        return Promise.resolve(true);
      },
    };
    const vault = new actual.ReconciliationVault(store, { chainId, sellerKeyId }, captureSessionGuard());
    await vault.unlock(revealViewingKey());
    return vault;
  } };
});

beforeEach(() => {
  clearSession();
  vaultData = new Map();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  // Freeze invoice/decision time without replacing the timers used by the worker and user interactions.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe('Scan completion and explicit late-payment review (P14 F4)', () => {
  it('retains verified evidence while a secondary lags by one block, then permits a seller decision after an explicit complete rescan', async () => {
    const pub = generateSession();
    const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      rpcUrls: { [CHAIN_ID]: 'https://primary.test' },
      rpcUrlsSecondary: { [CHAIN_ID]: 'https://secondary.test' },
    }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 1, caller: FAKE_ROUTER, amount: 2_500_000n });
    const txHash = `0x${'a'.repeat(64)}`;
    const announcement = { ...mine.log, transactionHash: txHash };
    const payer = '0x2222222222222222222222222222222222222222' as Address;
    const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], announcement.data as Hex);
    const parsed = parseMetadata(metadata);
    if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
    const transfer = {
      address: TOKEN, topics: [TRANSFER_TOPIC, topicAddress(payer), announcement.topics[2] ?? '0x'],
      data: `0x${parsed.netAmount.toString(16).padStart(64, '0')}`, blockNumber: announcement.blockNumber,
      blockHash: announcement.blockHash, transactionHash: txHash, logIndex: '0x0',
    };
    const blockTime = NOW_MS / 1000 - 3600;
    let secondaryHead = 499;
    const rpcAt = (head: () => number) => {
      const chain = chainWithLogs(CHAIN_ID, 500, [announcement], (method, params) => {
        if (method === 'eth_blockNumber') return `0x${head().toString(16)}`;
        if (method === 'eth_getBlockByNumber' && BigInt(params[0] as bigint) > BigInt(head())) return null;
        if (method === 'eth_getLogs') {
          const filter = params[0] as { address?: string; fromBlock: bigint; toBlock: bigint };
          if (filter.address?.toLowerCase() === TOKEN) return filter.fromBlock <= 120n && filter.toBlock >= 120n ? [transfer] : [];
        }
        const common = { to: FAKE_ROUTER, from: payer, blockHash: announcement.blockHash, blockNumber: announcement.blockNumber };
        if (method === 'eth_getTransactionReceipt') return { ...common, status: '0x1', transactionHash: txHash, logs: [transfer, announcement] };
        if (method === 'eth_getTransactionByHash') return { ...common, hash: txHash, value: '0x0', input: encodeFunctionData({
          abi: ghostPayRouterAbi, functionName: 'payERC20',
          args: [parsed.token, mine.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata],
        }) };
        return undefined;
      });
      return { ...chain, getBlock: async (n: bigint) => {
        const block = await chain.getBlock(n);
        return block === null ? null : { ...block, timestamp: BigInt(blockTime) + (n - 120n) * 2n };
      } };
    };
    const primary = rpcAt(() => 500);
    const secondary = rpcAt(() => secondaryHead);
    const invoiceDigest = `0x${'b'.repeat(64)}`;
    const vault = await createCurrentReconciliationVault(CHAIN_ID, keyId);
    await vault.registerInvoice({
      version: 1, invoiceDigest, nonce: 'c'.repeat(32), chainId: CHAIN_ID, asset: TOKEN,
      expectedNetMinorUnits: parsed.netAmount.toString(), createdAt: blockTime - 600, expiresAt: blockTime - 1, registeredAt: NOW_MS,
    });
    vault.lock();
    const readRecords = async () => {
      const current = await createCurrentReconciliationVault(CHAIN_ID, keyId);
      try { return await current.read(); }
      finally { current.lock(); }
    };
    const checkpoints = memoryCheckpoints();
    const user = userEvent.setup();
    renderApp(makeServices({
      nowMs: () => NOW_MS,
      checkpoints,
      loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' }),
      createRpc: (_chain, url) => {
        if (new URL(url).origin === 'https://primary.test') return Promise.resolve(withManifestChain(primary));
        if (new URL(url).origin === 'https://secondary.test') return Promise.resolve(withManifestChain(secondary));
        throw new Error('Unexpected synthetic RPC route');
      },
      createScanWorker: () => new InlineWorker(),
    }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
    await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await screen.findByText(/Finished\. 1 announcements checked, 1 payments found\./);
    expect(screen.getByText('Seller-signed receipt')).toBeTruthy();
    expect(screen.getAllByText(mine.stealthAddress).length).toBeGreaterThan(0);
    expect(screen.queryByText(/The second RPC reports block/)).toBeNull();
    expect(screen.queryByText(/The second RPC provider disagreed/)).toBeNull();
    expect(screen.queryByText(/This scan reached its safety limit|deferred by the per-scan budget/)).toBeNull();
    expect(screen.queryByText(/Payment observations could not be saved/)).toBeNull();
    const observed = await readRecords();
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ chainId: CHAIN_ID, transactionHash: txHash, blockNumber: '120', blockTimestamp: String(blockTime), evidenceStatus: 'verified-at-scan' });
    expect(observed[0]).not.toHaveProperty('invoiceDigest');
    expect(observed[0]).not.toHaveProperty('lateAcceptedAt');
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
    expect([...vaultData.values()].join('')).not.toContain(txHash);
    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await screen.findAllByText('Verified late transfer — invoice decision pending');
    // The missing block must withhold the decision, even though this older transfer is final on both RPCs.
    // A soft assertion still fails the test, while also exercising the positive recovery journey on the baseline.
    expect.soft(screen.queryByRole('button', { name: 'Accept late payment for this invoice' })).toBeNull();
    expect(screen.getAllByText('Scan this payment again with complete verification to make a decision.').length).toBeGreaterThan(0);

    secondaryHead = 500;
    const resume = screen.getByLabelText<HTMLInputElement>('Resume from checkpoint');
    if (resume.checked) await user.click(resume);
    expect(resume.checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Start block').value).toBe('100');
    const beforeRescan = primary.calls.length;
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const accept = await screen.findByRole('button', { name: 'Accept late payment for this invoice' });
    await screen.findByText(/Finished\. 1 announcements checked, 1 payments found\./);
    const freshWindows = primary.calls.slice(beforeRescan).filter((call) => call.method === 'eth_getLogs').map((call) => call.params[0] as LogFilter);
    // The default privacy client pads RPC windows, but this explicit rescan must re-fetch the payment's block.
    expect(freshWindows.some((filter) => filter.address === FAKE_ANNOUNCER && filter.fromBlock <= 120n && filter.toBlock >= 120n)).toBe(true);
    const undecided = await readRecords();
    expect(undecided).toHaveLength(1);
    expect(undecided[0]).toMatchObject({ transactionHash: txHash, evidenceStatus: 'verified-at-scan' });
    expect(undecided[0]).not.toHaveProperty('invoiceDigest');
    expect(undecided[0]).not.toHaveProperty('lateAcceptedAt');

    const beforeDecision = [primary.calls.length, secondary.calls.length];
    await user.click(accept);
    await waitFor(async () => {
      expect(await readRecords()).toMatchObject([{ transactionHash: txHash, invoiceDigest, lateAcceptedAt: NOW_MS, evidenceStatus: 'verified-at-scan' }]);
    });
    for (const [index, rpc] of [primary, secondary].entries()) {
      expect(rpc.calls.slice(beforeDecision[index]).map((call) => call.method)).toContain('eth_getTransactionReceipt');
    }
    expect(await screen.findByText('Verified late payment accepted by seller.')).toBeTruthy();
  });
});
