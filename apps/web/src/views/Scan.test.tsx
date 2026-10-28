// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { checkpointKeyId } from '../lib/scanClient';
import * as scanClient from '../lib/scanClient';
import { clearSession, generateSession, importSession, withSessionSecrets } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { chainWithLogs } from '../test/mockChain';
import { makeServices, memoryCheckpoints, renderApp } from '../test/render';
import type { Services } from '../lib/services';
import { verifyReceipt } from '../lib/receipts';
import { RECONCILIATION_LEDGER_DATA_KEY } from '../lib/reconciliationLedger';
import type { ReconciliationVaultStore } from '../lib/reconciliationVault';
import { captureSessionGuard, revealViewingKey } from '../lib/session';
import { ghostPayRouterAbi, grossForNet, validateAnnouncementLog, type Address, type Hex } from '@ghostpay/chain-adapters';
import { recordFromVerifiedMatch } from '../lib/reconciliationLedger';
import { parseMetadata } from '@ghostpay/core-crypto';
import { decodeAbiParameters, encodeFunctionData } from 'viem/utils';

let vaultData = new Map<string, string>();
let vaultCreationGate: Promise<void> | undefined;
let vaultCreationWaiting = false;
let vaultWriteGate: Promise<void> | undefined;
let vaultWriteWaiting = false;
vi.mock('../lib/reconciliationVault', async (original) => {
  const actual = await original<typeof import('../lib/reconciliationVault')>();
  return { ...actual, createCurrentReconciliationVault: async (chainId: number, sellerKeyId: string) => {
    const store: ReconciliationVaultStore = { read: (key) => Promise.resolve(vaultData.get(key) ?? null), compareAndSwap: async (key, expected, next, guard) => {
      if (vaultWriteGate !== undefined) { vaultWriteWaiting = true; await vaultWriteGate; }
      guard(); if ((vaultData.get(key) ?? null) !== expected) return false; vaultData.set(key, next); return true;
    } };
    const vault = new actual.ReconciliationVault(store, { chainId, sellerKeyId }, captureSessionGuard());
    await vault.unlock(revealViewingKey());
    if (vaultCreationGate !== undefined) { vaultCreationWaiting = true; await vaultCreationGate; }
    return vault;
  } };
});

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address: string): string => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

beforeEach(() => {
  clearSession();
  vaultData = new Map();
  vaultCreationGate = undefined;
  vaultCreationWaiting = false;
  vaultWriteGate = undefined;
  vaultWriteWaiting = false;
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id), trust: 'unsigned-dev', warning: 'UNSIGNED DEV MANIFEST: test.' });

async function openScan(services: Services, pickBaseSepolia = true): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderApp(services);
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Scan and receive' }));
  if (pickBaseSepolia) await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Base Sepolia' }));
  return user;
}

describe('Scan and receive', () => {
  it('needs keys first', async () => {
    const user = await openScan(makeServices(), false);
    expect(screen.getByText('Load or generate seller keys first.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Go to Seller keys' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Seller keys' })).toBeTruthy();
  });

  it('refuses to scan without an RPC or a manifest, with plain explanations', async () => {
    const pub = generateSession();
    void pub;
    const user = await openScan(makeServices({ loadManifest: loaded }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Configure an RPC/);
  });

  it('says payments are disabled when no manifest is loaded', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const user = await openScan(makeServices());
    expect(await screen.findByText(/Payments disabled on this chain/)).toBeTruthy();
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Payments are disabled on this chain/);
  });

  it('requires a numeric start block', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 10, []);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter the block number/);
  });

  it('scans in a worker, lists my payments, supports encrypted tags and lets me pick one to sweep', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_500_000n });
    const { encodeMetaAddress, generateKeySet } = await import('@ghostpay/core-crypto');
    const other = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(generateKeySet()), block: 121, index: 1, caller: FAKE_ROUTER });
    const rpc = chainWithLogs(84532, 500, [mine.log, other.log]);
    const checkpoints = memoryCheckpoints();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), checkpoints, createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText('Payments found')).toBeTruthy();
    expect(screen.getByText(/2\.5 USDC/)).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    expect(screen.getByText(/could not be verified as a payment/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign receipt' })).toBeNull();
    expect(screen.queryByText(other.stealthAddress)).toBeNull();
    await waitFor(() => { expect(screen.getByText(/Finished\. 2 announcements checked, 1 payments found\./)).toBeTruthy(); });
    expect(checkpoints.load(84532, checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey))?.nextBlock).toBe(401n); // head 500 + 1 - finalityDepth 100: the tail is re-scanned on resume
    expect(screen.getByText(/Resume from checkpoint/)).toBeTruthy();

    // Tags: locked by default, unlock, tag, lock hides, delete everything.
    expect(screen.queryByLabelText(/Client tag/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
    const input = await screen.findByLabelText(/Client tag/);
    await user.type(input, 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Save tag' }));
    expect(await screen.findByText('Acme Corp', { selector: 'strong' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lock tags' }));
    await waitFor(() => { expect(screen.queryByText('Acme Corp', { selector: 'strong' })).toBeNull(); });
    await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
    expect(await screen.findByText('Acme Corp', { selector: 'strong' })).toBeTruthy();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Delete all tags' }));
    expect(screen.getByText('Acme Corp', { selector: 'strong' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete all tags' }));
    await waitFor(() => { expect(screen.queryByLabelText(/Client tag/)).toBeNull(); });

    await user.click(screen.getByRole('button', { name: 'Clear checkpoint' }));
    expect(checkpoints.load(84532, checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey))).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Sweep this payment' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Sweep' })).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
  });

  it('opts into deep scan for wrong view tags and labels the diagnostic', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const wrongTag = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, wrongTag: true });
    const rpc = chainWithLogs(84532, 500, [wrongTag.log]);
    const worker = new InlineWorker();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => worker }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByLabelText('Deep scan (also check wrong view tags)'));
    expect(screen.getByText(/substantially more CPU/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/found by deep scan: announced view tag did not match/)).toBeTruthy();
    const batch = worker.received.find((m) => m.type === 'batch');
    expect(batch?.type === 'batch' && batch.logs[0]?.skipTag).toBe(true);
    expect(screen.getByText(/Claimed, not confirmed/)).toBeTruthy();
  });

  it('clears actionable matches when the selected chain changes after a scan', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER });
    const rpc = chainWithLogs(84532, 500, [mine.log]);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByRole('button', { name: 'Sweep this payment' })).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Chain'), '11155111');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sweep this payment' })).toBeNull();
      expect(screen.queryByText(mine.stealthAddress)).toBeNull();
    });
  });

  it('clears actionable matches when the seller session changes after a scan', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER });
    const rpc = chainWithLogs(84532, 500, [mine.log]);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByRole('button', { name: 'Sweep this payment' })).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    act(() => { clearSession(); generateSession(); });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sweep this payment' })).toBeNull();
      expect(screen.queryByText(mine.stealthAddress)).toBeNull();
    });
  });

  it('signs and exports a receipt from immutable finalized match data only', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 1, caller: FAKE_ROUTER, amount: 2_500_000n });
    const txHash = `0x${'a'.repeat(64)}`;
    const announcement = { ...mine.log, transactionHash: txHash };
    const payer = '0x2222222222222222222222222222222222222222' as Address;
    const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], announcement.data as Hex);
    const parsed = parseMetadata(metadata);
    if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
    const transfer = {
      address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      topics: [TRANSFER_TOPIC, topicAddress(payer), announcement.topics?.[2] ?? '0x'],
      data: `0x${2_500_000n.toString(16).padStart(64, '0')}`,
      blockNumber: announcement.blockNumber,
      blockHash: announcement.blockHash,
      transactionHash: txHash,
      logIndex: '0x0',
    };
    const rpc = chainWithLogs(84532, 500, [announcement], (method, params) => {
      if (method === 'eth_getLogs' && (params[0] as { address?: string }).address?.toLowerCase() === transfer.address) return [transfer];
      const common = { to: FAKE_ROUTER, from: payer, blockHash: announcement.blockHash, blockNumber: announcement.blockNumber };
      if (method === 'eth_getTransactionReceipt') return { ...common, status: '0x1', transactionHash: txHash, logs: [transfer, announcement] };
      if (method === 'eth_getTransactionByHash') return { ...common, hash: txHash, value: '0x0', input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [parsed.token, mine.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata] }) };
      return undefined;
    });
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText('Seller-signed receipt')).toBeTruthy();
    expect(screen.getByText(/2\.5 USDC/, { selector: 'dd' })).toBeTruthy();
    const invoiceDigest = `0x${'b'.repeat(64)}`;
    await user.type(screen.getByLabelText('Invoice digest (entered manually)'), invoiceDigest);
    await user.click(screen.getByRole('button', { name: 'Sign receipt' }));
    const json = await screen.findByLabelText<HTMLTextAreaElement>('Signed receipt JSON');
    const decoded: unknown = JSON.parse(json.value);
    expect(verifyReceipt(decoded)).toBe(true);
    expect(decoded).toMatchObject({
      invoiceDigest,
      chainId: 84532,
      txHash,
      stealthAddress: mine.stealthAddress.toLowerCase(),
      asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      amountMinorUnits: '2500000',
      signerPublicKey: pub.signerPublicKey,
    });
    expect(screen.getByText(/does not establish seller identity/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }));
    await user.type(await screen.findByLabelText('Invoice digest (optional, manual link)'), invoiceDigest);
    await user.click(screen.getByRole('button', { name: 'Add verified payment to ledger' }));
    await screen.findByText(/Manual invoice link/);
    const { createCurrentReconciliationVault } = await import('../lib/reconciliationVault');
    const reconciliation = await createCurrentReconciliationVault(84532, checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey));
    expect((await reconciliation.read())[0]).toMatchObject({
      sellerKeyId: checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey),
      chainId: 84532,
      transactionHash: txHash,
      invoiceDigest,
      evidenceStatus: 'verified-at-scan',
      evidenceSource: 'verified-router-scan',
    });
    expect(window.localStorage.getItem(RECONCILIATION_LEDGER_DATA_KEY)).toBeNull();
    expect([...vaultData.values()][0]).not.toContain(txHash);
  });

  it('does not offer another key set\'s checkpoint (WEB-APP-04)', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 500, []);
    const checkpoints = memoryCheckpoints();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), checkpoints }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
    expect(screen.getByLabelText('Resume from checkpoint')).toBeTruthy();
    expect(checkpoints.load(84532, checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey))).toBeDefined();
    act(() => { clearSession(); generateSession(); });
    await waitFor(() => { expect(screen.queryByLabelText('Resume from checkpoint')).toBeNull(); });
    expect(screen.queryByText(/A checkpoint exists/)).toBeNull();
  });

  it('cross-checks with the second RPC configured in Settings (WEB-APP-04)', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, rpcUrlsSecondary: { '84532': 'https://rpc2.test' } }));
    const primary = chainWithLogs(84532, 500, []);
    const secondary = chainWithLogs(84532, 500, []);
    const created: string[] = [];
    const createRpc: Services['createRpc'] = (_c, url) => {
      created.push(url);
      return Promise.resolve(url.startsWith('https://rpc2.test') ? secondary : withManifestChain(primary));
    };
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
    expect(created.some((u) => u.startsWith('https://rpc2.test'))).toBe(true);
    expect(secondary.calls.some((c) => c.method === 'eth_getLogs')).toBe(true);
    expect(screen.queryByText(/Only one RPC was used/)).toBeNull();
  });

  it('fails closed when the configured second RPC cannot be opened instead of scanning with one provider', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' }, rpcUrlsSecondary: { '84532': 'https://rpc2.test' } }));
    const primary = chainWithLogs(84532, 500, []);
    const createRpc: Services['createRpc'] = (_c, url) =>
      url.startsWith('https://rpc2.test') ? Promise.reject(new Error('CHAIN_MISMATCH: wrong chain')) : Promise.resolve(withManifestChain(primary));
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/second RPC configured for this chain could not be used/)).toBeTruthy(); });
    expect(primary.calls.some((c) => c.method === 'eth_getLogs')).toBe(false);
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

  it('quarantines actionable cards before confirmation and retains unsaved observations for confirmed tombstones', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 1, caller: FAKE_ROUTER });
    const announcement = validateAnnouncementLog(mine.log, FAKE_ANNOUNCER, 1n, 0n, 500n)!;
    const match: scanClient.ScanMatch = { chainId: 84532, announcement, stealthAddress: mine.stealthAddress as Address, metadata: parseMetadata(announcement.metadata), viaRouter: true, tagMatches: true, receipt: 'verified' };
    let params!: scanClient.ScanParams; let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runner = vi.spyOn(scanClient, 'runScan').mockImplementation(async (p) => {
      params = p; p.onMatch?.(match); await gate; p.viewingKey.fill(0);
      return { matches: [], cursor: { nextBlock: 0n }, scanned: 1, discrepancies: [], limitReached: false };
    });
    try {
      const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(chainWithLogs(84532, 500, []))) }));
      await user.type(screen.getByLabelText('Start block'), '0'); await user.click(screen.getByRole('button', { name: 'Start scan' }));
      expect(await screen.findByRole('button', { name: 'Sweep this payment' })).toBeTruthy();
      act(() => { params.onQuarantine?.(0n); });
      expect(screen.queryByRole('button', { name: 'Sweep this payment' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sign receipt' })).toBeNull();
      expect(vaultData.size).toBe(0);
      await act(async () => { await params.onReorg?.(0n); });
      const { createCurrentReconciliationVault } = await import('../lib/reconciliationVault');
      const keyId = checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey);
      const vault = await createCurrentReconciliationVault(84532, keyId);
      expect(await vault.read()).toEqual([]);
      await expect(vault.save(recordFromVerifiedMatch(match, keyId))).rejects.toThrow(/invalidated/);
      vault.lock();
      release(); await waitFor(() => expect(screen.getByText(/Finished\./)).toBeTruthy());
    } finally { release(); runner.mockRestore(); }
  });

  it.each(['unlock', 'write'] as const)('does not invalidate history after cancellation while reconciliation %s is pending', async (stage) => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 1, caller: FAKE_ROUTER });
    const announcement = validateAnnouncementLog(mine.log, FAKE_ANNOUNCER, 1n, 0n, 500n)!;
    const match: scanClient.ScanMatch = { chainId: 84532, announcement, stealthAddress: mine.stealthAddress as Address, metadata: parseMetadata(announcement.metadata), viaRouter: true, tagMatches: true, receipt: 'verified' };
    let params!: scanClient.ScanParams; let finish!: () => void; let unlock!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const vaultGate = new Promise<void>((resolve) => { unlock = resolve; });
    if (stage === 'unlock') vaultCreationGate = vaultGate;
    else vaultWriteGate = vaultGate;
    const runner = vi.spyOn(scanClient, 'runScan').mockImplementation(async (p) => {
      params = p; p.onMatch?.(match); await gate; p.viewingKey.fill(0);
      return { matches: [], cursor: { nextBlock: 0n }, scanned: 1, discrepancies: [], limitReached: false };
    });
    try {
      const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(chainWithLogs(84532, 500, []))) }));
      await user.type(screen.getByLabelText('Start block'), '0'); await user.click(screen.getByRole('button', { name: 'Start scan' }));
      await screen.findByRole('button', { name: 'Sweep this payment' });
      act(() => { params.onQuarantine?.(0n); });
      const invalidation = Promise.resolve(params.onReorg?.(0n)).catch(() => undefined);
      await waitFor(() => expect(stage === 'unlock' ? vaultCreationWaiting : vaultWriteWaiting).toBe(true));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await act(async () => { unlock(); await invalidation; });
      expect(vaultData.size).toBe(0);
      finish(); await waitFor(() => expect(screen.getByText(/Cancelled\./)).toBeTruthy());
    } finally { unlock(); finish(); runner.mockRestore(); }
  });

  it('warns that a block too large for one RPC response was checked for router payments only (L4-01)', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const { ChainAdapterError } = await import('@ghostpay/chain-adapters');
    const { encodeMetaAddress, generateKeySet } = await import('@ghostpay/core-crypto');
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 1500, index: 0, caller: FAKE_ROUTER });
    const spam = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: encodeMetaAddress(generateKeySet()), block: 1500, index: 1, caller: '0x9999999999999999999999999999999999999999' });
    const logs = [mine.log, spam.log];
    const rpc = chainWithLogs(84532, 4000, logs, (method, params) => {
      if (method !== 'eth_getLogs') return undefined;
      const f = params[0] as { address: string; topics: readonly (string | null)[]; fromBlock: bigint; toBlock: bigint };
      if (f.address.toLowerCase() !== FAKE_ANNOUNCER.toLowerCase()) return undefined;
      const caller = f.topics[3];
      if (caller == null && f.fromBlock <= 1500n && f.toBlock >= 1500n) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
      return logs.filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock && (caller == null || l.topics[3] === caller));
    });
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '1000');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => { expect(screen.getByText(/Finished\./)).toBeTruthy(); });
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    expect(screen.getByText(/Block 1500 held more announcements than one RPC response may carry/)).toBeTruthy();
    expect(screen.getByText(/announcements there that were not posted by the GhostPay router were skipped/)).toBeTruthy();
  });

  it('says so when only one RPC was used', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 500, []);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)) }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/Only one RPC was used/)).toBeTruthy();
  });

  it('can be cancelled while running', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 900_000, []);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const worker = new InlineWorker();
    const original = worker.postMessage.bind(worker);
    worker.postMessage = (m): void => {
      if (m.type === 'batch') void gate.then(() => { original(m); });
      else original(m);
    };
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => worker }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => { expect((cancel as HTMLButtonElement).disabled).toBe(false); });
    await user.click(cancel);
    release();
    await waitFor(() => { expect(screen.getByText(/Cancelled\./)).toBeTruthy(); });
    expect(worker.terminated).toBe(true);
    expect(worker.received.some((m) => m.type === 'cancel')).toBe(true);
  });

  it('reports a worker/keys failure as an error', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 10, []);
    const bad = new InlineWorker();
    bad.postMessage = (): void => {
      queueMicrotask(() => bad.onerror?.(new Error('x')));
    };
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(rpc)), createScanWorker: () => bad }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/worker failed/);
  });

  it('keeps tags locked and says so when the vault rejects the viewing key', async () => {
    generateSession();
    const services = makeServices();
    await services.vault.unlock(new Uint8Array(32).fill(1));
    services.vault.lock();
    const user = await openScan(services);
    await user.click(screen.getByRole('button', { name: 'Unlock tags' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/different viewing key/);
  });

  it('blocks the scan when on-chain state contradicts the manifest, and warns about unsigned dev manifests', async () => {
    generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const rpc = chainWithLogs(84532, 10, []);
    const evil = withManifestChain(rpc, { feeRecipient: '0x00000000000000000000000000000000deadbeef' });
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(evil), createScanWorker: () => new InlineWorker() }));
    expect(await screen.findByText(/UNSIGNED DEV MANIFEST/)).toBeTruthy();
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/do not match the deployment manifest/);
  });
  it('aborts pending scan setup when identical seller keys are cleared and reimported', async () => {
    generateSession();
    const keys = withSessionSecrets(({ keys, signingKey }) => ({
      spendingKeyHex: Array.from(keys.spendingSecret, (b) => b.toString(16).padStart(2, '0')).join(''),
      viewingKeyHex: Array.from(keys.viewingSecret, (b) => b.toString(16).padStart(2, '0')).join(''),
      signingKeyHex: Array.from(signingKey, (b) => b.toString(16).padStart(2, '0')).join(''),
    }));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    let release!: (rpc: ReturnType<typeof withManifestChain>) => void;
    const gate = new Promise<ReturnType<typeof withManifestChain>>((resolve) => { release = resolve; });
    const createWorker = vi.fn(() => new InlineWorker()); const checkpoints = memoryCheckpoints();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => gate, checkpoints, createScanWorker: createWorker }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    act(() => { clearSession(); importSession(keys); });
    release(withManifestChain(chainWithLogs(84532, 500, [])));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start scan' }).disabled).toBe(false));
    expect(createWorker).not.toHaveBeenCalled();
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

  it('stops an active worker and prevents checkpoints when the same keys are reimported', async () => {
    const pub = generateSession();
    const keys = withSessionSecrets(({ keys, signingKey }) => ({
      spendingKeyHex: Array.from(keys.spendingSecret, (b) => b.toString(16).padStart(2, '0')).join(''),
      viewingKeyHex: Array.from(keys.viewingSecret, (b) => b.toString(16).padStart(2, '0')).join(''),
      signingKeyHex: Array.from(signingKey, (b) => b.toString(16).padStart(2, '0')).join(''),
    }));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER });
    const worker = new InlineWorker(); const original = worker.postMessage.bind(worker);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let batchPending = false;
    worker.postMessage = (message): void => { if (message.type === 'batch') { batchPending = true; void gate.then(() => original(message)); } else original(message); };
    const checkpoints = memoryCheckpoints();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(withManifestChain(chainWithLogs(84532, 500, [mine.log]))), checkpoints, createScanWorker: () => worker }));
    await user.type(screen.getByLabelText('Start block'), '0'); await user.click(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => expect(batchPending).toBe(true));
    act(() => { clearSession(); importSession(keys); }); release();
    await waitFor(() => expect(worker.terminated).toBe(true));
    expect(checkpoints.load(84532, checkpointKeyId(pub.spendingPublicKey, pub.viewingPublicKey))).toBeUndefined();
    expect(screen.queryByText(/Finished\./)).toBeNull();
  });

});
