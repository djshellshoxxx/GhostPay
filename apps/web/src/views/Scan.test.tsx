// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession } from '../lib/session';
import { SETTINGS_KEY } from '../lib/settings';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from '../test/fakeManifest';
import { InlineWorker } from '../test/inlineWorker';
import { TOKEN_84532, makeLog } from '../test/announcements';
import { chainWithLogs, verificationReads } from '../test/mockChain';
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
    const rpc = chainWithLogs(84532, 500, [mine.log, other.log], verificationReads([{ token: TOKEN_84532, router: FAKE_ROUTER, stealth: mine.stealthAddress, block: 120, net: 2_500_000n }]));
    const checkpoints = memoryCheckpoints();
    const user = await openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), checkpoints, createScanWorker: () => new InlineWorker() }));
    await user.type(screen.getByLabelText('Start block'), '100');
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(await screen.findByText('Announcements addressed to you')).toBeTruthy();
    // Only after the chain confirmed it is it called "received" (S3-02).
    expect(await screen.findByText(/Received: 2\.5 USDC/)).toBeTruthy();
    expect(screen.queryByText(/paid directly/)).toBeNull();
    expect(screen.getByText(/381 confirmations/)).toBeTruthy();
    expect(screen.getByText(mine.stealthAddress)).toBeTruthy();
    expect(screen.queryByText(other.stealthAddress)).toBeNull();
    await waitFor(() => { expect(screen.getByText(/Finished\. 2 announcements checked, 1 announcement addressed to you\./)).toBeTruthy(); });
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

  describe('payment integrity (S3-02, D4)', () => {
    const OTHER = '0x00000000000000000000000000000000000000ee';
    async function setup(logs: ReturnType<typeof makeLog>[], extra: (m: string, p: readonly unknown[]) => unknown = () => undefined, over: Partial<Services> = {}) {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rpcUrls: { '84532': 'https://rpc.test' } }));
      const rpc = chainWithLogs(84532, 500, logs.map((l) => l.log), extra);
      return openScan(makeServices({ loadManifest: loaded, createRpc: () => Promise.resolve(rpc), ...over }));
    }
    const start = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.type(screen.getByLabelText('Start block'), '100');
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
    };

    it('shows a forged announcement from anyone but the router as UNVERIFIED, never as received', async () => {
      const pub = generateSession();
      const forged = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 0, caller: OTHER, amount: 10n ** 12n });
      const user = await setup([forged]);
      await start(user);
      expect(await screen.findByText('Unverified announcement')).toBeTruthy();
      expect(screen.getByText(/It claims|it claims/)).toBeTruthy();
      expect(document.body.textContent).toMatch(/is not money you have received|not\s+money you have received/);
      expect(screen.getByText(/Anyone can post an announcement with any token and amount/)).toBeTruthy();
      expect(screen.queryByText(/Received:/)).toBeNull();
      expect(screen.queryByText(/paid directly/)).toBeNull();
    });

    it('a router announcement with no matching token Transfer is an unverified claim', async () => {
      const pub = generateSession();
      const claim = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n });
      const user = await setup([claim], verificationReads([]));
      await start(user);
      expect(await screen.findByText('Unverified payment claim')).toBeTruthy();
      expect(screen.getByText(/No matching token Transfer/)).toBeTruthy();
      expect(screen.queryByText(/Received:/)).toBeNull();
    });

    it('collapses a replayed announcement of the same one-time address and key', async () => {
      const pub = generateSession();
      const genuine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n });
      const replay = { ...genuine, log: { ...genuine.log, blockNumber: '0x8c', blockHash: `0x${'8c'.padStart(64, '0')}`, logIndex: '0x3' } };
      const user = await setup([genuine, replay], verificationReads([{ token: TOKEN_84532, router: FAKE_ROUTER, stealth: genuine.stealthAddress, block: 130, net: 5_000_000n }]));
      await start(user);
      expect(await screen.findByText(/Received: 5 USDC/)).toBeTruthy();
      expect(screen.getAllByText('Sweep this payment')).toHaveLength(1);
      expect(screen.getByText(/1 repeated announcement of the same one-time address ignored/)).toBeTruthy();
    });

    it('deep scan finds a payment with a wrong view tag; an ordinary scan does not', async () => {
      const pub = generateSession();
      const wrong = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n, wrongTag: true });
      const reads = verificationReads([{ token: TOKEN_84532, router: FAKE_ROUTER, stealth: wrong.stealthAddress, block: 130, net: 5_000_000n }]);
      const user = await setup([wrong], reads);
      await start(user);
      await waitFor(() => { expect(screen.getByText(/Finished\. 1 announcements checked, 0 announcements addressed to you/)).toBeTruthy(); });
      expect(screen.getByText(/Cost: one extra elliptic-curve multiplication/)).toBeTruthy();
      await user.click(screen.getByLabelText(/Deep scan/));
      await user.click(screen.getByLabelText(/Resume from checkpoint/));
      await user.clear(screen.getByLabelText('Start block'));
      await user.type(screen.getByLabelText('Start block'), '100');
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
      expect(await screen.findByText('Wrong view tag')).toBeTruthy();
      expect(await screen.findByText(/Received: 5 USDC/)).toBeTruthy();
    });

    it('keeps matches with the chain they were found on', async () => {
      const pub = generateSession();
      const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 0, caller: FAKE_ROUTER, amount: 5_000_000n });
      const user = await setup([mine], verificationReads([]));
      await start(user);
      await screen.findByText('Unverified payment claim');
      await user.selectOptions(screen.getByLabelText('Chain'), screen.getByRole('option', { name: 'Ethereum Sepolia' }));
      expect(screen.getByText(/No announcements addressed to you found yet\./)).toBeTruthy();
      expect(screen.queryByText('Sweep this payment')).toBeNull();
    });

    it('refuses to scan while the deployment is not verified on-chain', async () => {
      generateSession();
      const user = await setup([], () => undefined, {
        verifyDeployment: () => Promise.reject(Object.assign(new Error('DEPLOYMENT_UNVERIFIED: router code hash differs from the manifest'), { name: 'ChainAdapterError' })),
      });
      expect(await screen.findByText(/router code hash differs from the manifest/)).toBeTruthy();
      await user.type(screen.getByLabelText('Start block'), '0');
      await user.click(screen.getByRole('button', { name: 'Start scan' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/could not be verified/);
    });

    it('warns that the RPC provider sees what is scanned', async () => {
      generateSession();
      await setup([]);
      expect(screen.getByText('Your RPC provider sees this')).toBeTruthy();
      expect(screen.getByText(/rpc\.test/)).toBeTruthy();
    });

    it('verifies a payer-supplied transaction hash without the view-tag shortcut', async () => {
      const pub = generateSession();
      const TX = `0x${'cd'.repeat(32)}`;
      const wrong = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: pub.metaAddress, block: 130, index: 4, caller: FAKE_ROUTER, amount: 5_000_000n, wrongTag: true });
      const reads = verificationReads([{ token: TOKEN_84532, router: FAKE_ROUTER, stealth: wrong.stealthAddress, block: 130, net: 5_000_000n }]);
      const user = await setup([], (m, p) => {
        if (m === 'eth_getTransactionReceipt') return p[0] === TX ? { status: '0x1', blockNumber: '0x82', logs: [wrong.log] } : null;
        return reads(m, p);
      });
      await screen.findByText('Check a payer’s transaction hash');
      await user.type(screen.getByLabelText('Transaction hash'), 'nonsense');
      await user.click(screen.getByRole('button', { name: 'Check this transaction' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/0x followed by 64 hex/);
      await user.clear(screen.getByLabelText('Transaction hash'));
      await user.type(screen.getByLabelText('Transaction hash'), TX);
      await user.click(screen.getByRole('button', { name: 'Check this transaction' }));
      expect(await screen.findByText(/Received: 5 USDC/)).toBeTruthy();
      expect(screen.getByText(/published a wrong view tag/)).toBeTruthy();
      await user.clear(screen.getByLabelText('Transaction hash'));
      await user.type(screen.getByLabelText('Transaction hash'), `0x${'ab'.repeat(32)}`);
      await user.click(screen.getByRole('button', { name: 'Check this transaction' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/does not know this transaction/);
    });
  });
});
