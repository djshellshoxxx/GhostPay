// @vitest-environment jsdom
import { parseHeader, targetFromBits } from '@ghostpay/btc-silent-payments';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { coinbase, fakeIdb, forkChain, mineHeader, mockChain, SEED_A, walletA, type MockChain } from './fixtures.testutil';
import { MemoryHeaderStore, type HeaderStoreFor } from './headers';

/** One persistent store per test, shared across renders (stands in for IndexedDB). */
function sharedStore(): { readonly storeFor: HeaderStoreFor; readonly regtest: MemoryHeaderStore } {
  const regtest = new MemoryHeaderStore();
  return { storeFor: (id) => (id === 'regtest' ? regtest : new MemoryHeaderStore()), regtest };
}

async function open(chain: MockChain, storeFor: HeaderStoreFor) {
  const user = userEvent.setup();
  renderWith(<BtcView headerStore={storeFor} />, makeServices({ fetchFn: chain.fetchFn }));
  await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
  await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
  await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
  await user.click(screen.getByRole('button', { name: 'Import seed' }));
  await user.type(screen.getByLabelText(/First block height/), '1');
  return user;
}

/** JSON of a valid-looking regtest header chain anchored at a self-mined "genesis" instead of the pinned one. */
function forgedChainJson(): string {
  const genesis = mineHeader('11'.repeat(32), [coinbase(900)], 0x207fffff, 1_296_688_602);
  const headers: string[] = [];
  let prev = genesis;
  for (let i = 1; i <= 6; i++) {
    prev = mineHeader(parseHeader(prev).hash, [coinbase(900 + i)], 0x207fffff, 1_296_688_602 + 600 * i);
    headers.push(prev);
  }
  return JSON.stringify({ version: 1, network: 'regtest', checkpoint: { height: 0, hash: parseHeader(genesis).hash, headerHex: genesis, previousHeaders: [] }, headers });
}

const verified = (height: number): RegExp => new RegExp(`Block headers checked on this device from the pinned genesis block to height ${String(height)} `);

describe('BtcView header chain: review fixes', () => {
  it('adopts a heavier fork deeper than one sync round of headers (fork depth between 2048 and 4032)', async () => {
    const chain = mockChain('regtest', walletA());
    forkChain(chain.blocks, 5, 6000, 0); // tip 6004
    const store = sharedStore();
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(6004), undefined, { timeout: 30_000 });
    // A heavier branch replaces the last 2100 blocks (fork after height 3904, new tip 6005; the probe lands at 1909, so one round of 4032 stops short of it).
    forkChain(chain.blocks, 3905, 2101, 7);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(6005), undefined, { timeout: 30_000 });
    expect(screen.getByText('A chain with more work replaced the checked headers above height 3904.')).toBeTruthy();
    expect(screen.queryByText(/competing chain with no more work/)).toBeNull();
  }, 60_000);

  it('removes results from replaced blocks even when the sync fails after adopting a heavier fork', async () => {
    const chain = mockChain('regtest', walletA());
    let failTip = false;
    let tipCalls = 0;
    const fetchFn: MockChain['fetchFn'] = (url, init) => {
      if (failTip && url.endsWith('/blocks/tip/height') && ++tipCalls === 2) return Promise.resolve(new Response('boom', { status: 500 }));
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={sharedStore().storeFor} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    // Round 1 adopts a heavier fork that replaces the paying block; round 2 fails.
    forkChain(chain.blocks, 3, 3, 2);
    failTip = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/Header check failed: The server could not be reached/);
    expect(screen.getByText('A chain with more work replaced the checked headers above height 2.')).toBeTruthy();
    expect(screen.getByText(/Scan results above height 2 came from blocks that are no longer on the checked chain/)).toBeTruthy();
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ })).toBeNull();
  });
});

describe('BtcView header chain', () => {
  it('checks headers before scanning, saves them, and resumes from saved headers after they are checked again', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    let user = await open(chain, store.storeFor);
    expect(screen.getByText(/saved in this browser per network/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByText(verified(4)).textContent).toMatch(/This is not SPV and not full validation/);
    expect(screen.queryByText(/Resumed from/)).toBeNull();
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ network: 'regtest', headers: chain.blocks.slice(1).map((b) => b.header) });

    cleanup();
    chain.requests.length = 0;
    user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByText('Resumed from 4 saved block headers. All of them were checked again on this device before use.')).toBeTruthy();
    expect(screen.getByText(verified(4))).toBeTruthy();
    // Resuming reads one probe header, not the whole chain again.
    expect(chain.requests.filter((r) => r.startsWith('GET /blocks/') && r !== 'GET /blocks/tip/height')).toEqual(['GET /blocks/4']);
  });

  it.each([
    ['not JSON', (t: string) => `garbage{${t}`],
    ['another network', (t: string) => t.replace('"regtest"', '"signet"')],
    ['a tampered saved header', (t: string) => t.replace(/("headers":\[")([0-9a-f]{152})([0-9a-f]{8})/, (_m, a: string, b: string) => `${a}${b}ffffffff`)],
    // A whole self-consistent chain on another anchor (valid regtest proof of work throughout).
    ['a substituted anchor', () => forgedChainJson()],
  ])('discards saved headers with %s, never uses them, and checks again from genesis', async (_name, corrupt) => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    let user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    store.regtest.value = corrupt(store.regtest.value ?? '');
    cleanup();

    user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    expect(screen.getByText(/Saved block headers failed validation and were discarded/)).toBeTruthy();
    expect(screen.queryByText(/Resumed from/)).toBeNull();
    expect(screen.getByText(verified(4))).toBeTruthy();
    // What is saved now is the freshly checked chain.
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ headers: chain.blocks.slice(1).map((b) => b.header) });
  });

  it('fails closed on a header that breaks the chain rules: no scan runs and nothing is replaced', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    // Block 4 does not link to block 3 (a self-mined header with an unknown parent).
    chain.blocks[4]!.header = mineHeader('ab'.repeat(32), chain.blocks[4]!.txs, 0x207fffff, 1_700_010_000);
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Header check failed: The server sent a block header that breaks the chain rules\./);
    expect(screen.getByText(/No scan runs until a header check succeeds/)).toBeTruthy();
    expect(screen.queryByText(/unspent payment/)).toBeNull();
    expect(screen.queryByText(/No unspent payments found/)).toBeNull();
    expect(chain.requests.some((r) => r.includes('/txs/'))).toBe(false);
    expect(screen.queryByText(verified(4))).toBeNull();
  });

  it('fails closed on a header without valid proof of work', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    // Block 4 links correctly but its nonce misses the target; the served id is the hash of exactly that header.
    const good = chain.blocks[4]!.header!;
    let bad = good;
    for (let n = 1; BigInt(`0x${parseHeader(bad).hash}`) <= targetFromBits(0x207fffff); n++) bad = good.slice(0, 152) + n.toString(16).padStart(8, '0');
    chain.blocks[4]!.header = bad;
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Header check failed: The server returned data this app cannot trust\./);
    expect(chain.requests.some((r) => r.includes('/txs/'))).toBe(false);
  });

  it('ignores a competing chain with less work and refuses its blocks', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    // The server switches to a shorter branch from block 3: it has less work than the checked chain.
    forkChain(chain.blocks, 3, 1, 1);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/The server offered a competing chain with no more work/);
    // The checked chain, and the payment found on it, stay.
    expect(screen.getByText(verified(4))).toBeTruthy();
    expect(screen.getByText(/1 unspent payment/)).toBeTruthy();
    // A new scan reaches the server's block 3, which is not on the checked chain: refused.
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText('The chain changed while scanning. Run the scan again.');
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.getAllByText(/If you changed servers on purpose and trust the new one, use “Forget saved headers for this network”/)).toHaveLength(1);
    // The user switched servers on purpose: forget the saved headers, and the next check starts from genesis.
    expect(store.regtest.value).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    expect(store.regtest.value).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/No unspent payments found/);
    expect(screen.queryByText(/Resumed from/)).toBeNull();
    expect(screen.getByText(verified(3))).toBeTruthy();
  });

  it('says when saved headers cannot be forgotten', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    store.clear = () => Promise.reject(new Error('blocked'));
    const user = await open(chain, () => store);
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await screen.findByText('The saved block headers could not be deleted from this browser.');
  });

  it('follows a chain with more work and honestly removes the scan results from replaced blocks', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }));
    expect(screen.getByRole('heading', { name: '4. Sweep' })).toBeTruthy();
    // A longer branch from block 3 replaces the block that paid this wallet.
    forkChain(chain.blocks, 3, 3, 2);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText('A chain with more work replaced the checked headers above height 2.');
    expect(screen.getByText(/Scan results above height 2 came from blocks that are no longer on the checked chain and were removed \(1 payments\)/)).toBeTruthy();
    expect(screen.getByText(verified(5))).toBeTruthy();
    expect(screen.queryByText(/1 unspent payment/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: '4. Sweep' })).toBeNull();
    // The heavier chain was saved.
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ headers: chain.blocks.slice(1).map((b) => b.header) });
  });

  it('discards the whole scan when its first block was replaced', async () => {
    const chain = mockChain('regtest', walletA());
    const user = await open(chain, sharedStore().storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    forkChain(chain.blocks, 1, 5, 3);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText('The scanned blocks are no longer on the checked chain. The scan results were discarded; scan again.');
    expect(screen.queryByText(/Scanned blocks|unspent payment/)).toBeNull();
  });

  it('says when headers stop below the first height to scan, and scans nothing', async () => {
    const chain = mockChain('regtest', walletA());
    const user = await open(chain, sharedStore().storeFor);
    const height = screen.getByLabelText(/First block height/);
    await user.clear(height);
    await user.type(height, '9');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Block headers are checked only to height 4, below the first height to scan\. Nothing was scanned\./);
    expect(chain.requests.some((r) => r.includes('/txs/'))).toBe(false);
  });

  it('saves headers in IndexedDB by default when the browser has it, and resumes from there', async () => {
    const chain = mockChain('regtest', walletA());
    const idb = fakeIdb();
    vi.stubGlobal('indexedDB', idb);
    try {
      const run = async (): Promise<void> => {
        const user = userEvent.setup();
        renderWith(<BtcView />, makeServices({ fetchFn: chain.fetchFn }));
        await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
        await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
        await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
        await user.click(screen.getByRole('button', { name: 'Import seed' }));
        expect(screen.getByText(/saved in this browser per network/)).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Update headers' }));
        await screen.findByText(verified(4));
      };
      await run();
      expect(screen.queryByText(/could not be saved/)).toBeNull();
      expect([...idb.data.keys()]).toEqual(['headers:v1:regtest', 'headers:v1:regtest:work']);
      cleanup();
      await run();
      expect(screen.getByText(/Resumed from 4 saved block headers/)).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports a header store that cannot save, and a cancelled header check', async () => {
    const chain = mockChain('regtest', walletA());
    const failing = { load: () => Promise.reject(new Error('no db')), save: () => Promise.reject(new Error('quota')), clear: () => Promise.resolve() };
    const user = await open(chain, () => failing);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    expect(screen.getByText(/could not be saved in this browser/)).toBeTruthy();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: MockChain['fetchFn'] = async (url, init) => {
      if (url.endsWith('/blocks/0')) await gate;
      return chain.fetchFn(url, init);
    };
    cleanup();
    // Without a store at all (jsdom has no IndexedDB) headers live in memory, and the view says they are not kept.
    const u3 = userEvent.setup();
    renderWith(<BtcView />, makeServices({ fetchFn: slow }));
    await u3.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await u3.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await u3.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await u3.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.getByRole('heading', { name: 'Block headers' })).toBeTruthy();
    expect(screen.queryByText(/saved in this browser per network/)).toBeNull();
    await u3.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText('Checking block headers…');
    await u3.click(screen.getByRole('button', { name: 'Cancel' }));
    release();
    await screen.findByText(/Header check failed: Cancelled\./);
    await u3.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    expect(screen.getByText(/could not be saved in this browser/)).toBeTruthy();
  });
});
