// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { makeLog } from '../test/announcements';
import { chainWithLogs } from '../test/mockChain';
import { mockRpc } from '../test/mockRpc';
import { readbackManifestJson, readbackReply } from '../test/readbackRpc';
import { loadManifest, verifyManifestOnChain } from '../lib/manifest';
import { makeServices, memoryCheckpoints, renderApp } from '../test/render';
import type { Services } from '../lib/services';

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

const loaded: Services['loadManifest'] = (id) => Promise.resolve({ status: 'loaded', manifest: fakeManifest(id) });

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
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc) }));
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
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), checkpoints, createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText('Payments found')).toBeTruthy();
    expect(screen.getByText(/2\.5 USDC/)).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    expect(screen.queryByText(other.stealthAddress)).toBeNull();
    await waitFor(() => { expect(screen.getByText(/Finished\. 2 announcements checked, 1 payments found\./)).toBeTruthy(); });
    expect(checkpoints.load(84532)?.nextBlock).toBe(501n);
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
    expect(checkpoints.load(84532)).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Sweep this payment' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Sweep' })).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
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
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), createScanWorker: () => worker }));
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
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), createScanWorker: () => bad }));
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

  it('labels a direct payer\'s amount as a claim and an unconfirmed payment as not final', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const direct = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 450, index: 0, caller: '0x9999999999999999999999999999999999999999', amount: 7_000_000n });
    const viaRouter = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 2_000_000n });
    const rpc = chainWithLogs(84532, 500, [direct.log, viaRouter.log]);
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc) }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/Claimed by the payer, not verified: 7 USDC/)).toBeTruthy();
    expect(screen.getByText(/Verified: 2 USDC/)).toBeTruthy();
    expect(screen.queryByText(/Verified: 7 USDC/)).toBeNull();
    expect(screen.getByText(/Not final: 51 of 101 confirmations when scanned/)).toBeTruthy();
    expect(screen.getByText(/Final \(381 confirmations when scanned\)/)).toBeTruthy();
    expect(screen.getByText(/Anyone can announce a payment with any amount/)).toBeTruthy();
  });

  it('removes payments from a reorganised range and says so', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const doomed = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 49_950, index: 0, caller: FAKE_ROUTER });
    let forked = false;
    let checks = 0;
    const hash = (n: number): string => (forked && n >= 49_000 ? `0x${'f'.repeat(48)}${n.toString(16).padStart(16, '0')}` : `0x${n.toString(16).padStart(64, '0')}`);
    const rpc = mockRpc(84532, (method, params) => {
      if (method === 'eth_blockNumber') return '0x1d4c0';
      if (method === 'eth_getBlockByNumber') {
        const n = Number(params[0]);
        if (n === 49_999 && ++checks === 2) forked = true; // 1st: checkpoint of page 1; 2nd: reorg check of page 2
        return { hash: hash(n), parentHash: hash(n - 1), number: `0x${n.toString(16)}` };
      }
      if (method === 'eth_getLogs') {
        const f = params[0] as { fromBlock: bigint; toBlock: bigint };
        return forked ? [] : [doomed.log].filter((l) => BigInt(l.blockNumber) >= f.fromBlock && BigInt(l.blockNumber) <= f.toBlock);
      }
      throw new Error(`unexpected ${method}`);
    });
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc) }));
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/A chain reorganisation was detected: 1 payment was removed/)).toBeTruthy();
    await waitFor(() => { expect(screen.queryByText(doomed.stealthAddress)).toBeNull(); });
    expect(screen.getByText('No payments found yet.')).toBeTruthy();
  });

  it('fails closed when the manifest does not match the chain: no scan, plain explanation', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER });
    const chainRpc = chainWithLogs(84532, 500, [mine.log]);
    const rpc = mockRpc(84532, (m, p) => (m === 'eth_call' || m === 'eth_getCode' ? readbackReply(m, p, { feeRecipient: '0x9999999999999999999999999999999999999999' }) : chainRpc.request(m, p)));
    const user = await openScan(makeServices({
      loadManifest: () => loadManifest(84532, () => Promise.resolve(new Response(readbackManifestJson(84532)))),
      verifyManifest: verifyManifestOnChain,
      createRpc: () => Promise.resolve(rpc),
    }));
    expect((await screen.findByText(/could not be verified/)).textContent).toMatch(/router\.FEE_RECIPIENT/);
    await user.type(screen.getByLabelText('Start block'), '0');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Payments are disabled on this chain/);
    expect(chainRpc.calls.some((c) => c.method === 'eth_getLogs')).toBe(false);
  });

  it('with no RPC the real read-back refuses (fail closed) and asks for one', async () => {
    generateSession();
    await openScan(makeServices({
      loadManifest: () => loadManifest(84532, () => Promise.resolve(new Response(readbackManifestJson(84532)))),
      verifyManifest: verifyManifestOnChain,
    }));
    expect((await screen.findByText(/could not be verified/)).textContent).toMatch(/Add one in Settings/);
  });

  it('scans normally once the read-back passes', async () => {
    const pub = generateSession();
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
    const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 120, index: 0, caller: FAKE_ROUTER, amount: 3_000_000n });
    const chainRpc = chainWithLogs(84532, 500, [mine.log]);
    const rpc = mockRpc(84532, (m, p) => (m === 'eth_call' || m === 'eth_getCode' ? readbackReply(m, p) : chainRpc.request(m, p)));
    const user = await openScan(makeServices({
      loadManifest: () => loadManifest(84532, () => Promise.resolve(new Response(readbackManifestJson(84532)))),
      verifyManifest: verifyManifestOnChain,
      createRpc: () => Promise.resolve(rpc),
    }));
    await waitFor(() => { expect(rpc.calls.some((c) => c.method === 'eth_getCode')).toBe(true); });
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText(/Verified: 3 USDC/)).toBeTruthy();
  });
});
