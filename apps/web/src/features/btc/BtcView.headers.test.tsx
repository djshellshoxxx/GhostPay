// @vitest-environment jsdom
import { parseHeader, targetFromBits } from '@ghostpay/btc-silent-payments';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWith } from '../../test/render';
import { BtcView } from './BtcView';
import { coinbase, fakeIdb, forkChain, mineHeader, mockChain, SEED_A, walletA, type MockChain } from './fixtures.testutil';
import { bech32 } from '@scure/base';
import { EsploraClient } from './esplora';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders, type HeaderStoreFor } from './headers';
import { btcNetwork } from './network';

/** One persistent store per test, shared across renders (stands in for IndexedDB). */
function sharedStore(): { readonly storeFor: HeaderStoreFor; readonly regtest: MemoryHeaderStore } {
  const regtest = new MemoryHeaderStore();
  return { storeFor: (id) => (id === 'regtest' ? regtest : new MemoryHeaderStore()), regtest };
}

async function open(chain: MockChain, storeFor: HeaderStoreFor, limits?: { maxRounds?: number; headersPerRound?: number; maxHeaders?: number }) {
  const user = userEvent.setup();
  renderWith(<BtcView headerStore={storeFor} {...(limits === undefined ? {} : { headerSyncLimits: limits })} />, makeServices({ fetchFn: chain.fetchFn }));
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
  return JSON.stringify({ version: 2, network: 'regtest', checkpoint: { height: 0, hash: parseHeader(genesis).hash, headerHex: genesis, previousHeaders: [] }, headersHex: headers.join('') });
}

const verified = (height: number): RegExp => new RegExp(`Block headers checked on this device from the pinned genesis block to height ${String(height)} `);

const BCRT_DEST = bech32.encode('bcrt', [0, ...bech32.toWords(new Uint8Array(20).fill(3))]);

/** Renders the view with a fetch that can hold the next `/blocks/<n>` request (not the tip) of a header check. */
async function openHeld() {
  const chain = mockChain('regtest', walletA());
  let release: () => void = () => undefined;
  let hold = false;
  let held = false;
  const fetchFn: MockChain['fetchFn'] = async (url, init) => {
    if (hold && /\/blocks\/\d+$/.test(url)) {
      hold = false;
      held = true;
      await new Promise<void>((r) => { release = r; });
    }
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
  await user.click(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }));
  await user.type(screen.getByLabelText('Destination address'), BCRT_DEST);
  await user.click(screen.getByRole('button', { name: 'Review sweep' }));
  await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
  return {
    chain,
    user,
    /** Starts "Update headers" and waits until its first header request is being held (the chain is unchanged). */
    startHeldCheck: async (): Promise<void> => {
      hold = true;
      held = false;
      await user.click(screen.getByRole('button', { name: 'Update headers' }));
      await waitFor(() => { expect(held).toBe(true); });
    },
    release: (): void => { release(); },
  };
}

/** The real React onClick of a rendered element (to call a handler the UI would no longer offer). */
function reactOnClick(el: Element): () => void {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (key === undefined) throw new Error('no react props');
  return (el as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}

describe('BtcView header chain: busy state after a check', () => {
  it('M-new/L1: Sign is disabled only while a check runs (chain unchanged), and enabled again right after it', async () => {
    const t = await openHeld();
    await t.startHeldCheck();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' }).disabled).toBe(true);
    t.release();
    await screen.findByText(verified(4));
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' }).disabled).toBe(false); });
  });

  it('M-new/L1: Broadcast is disabled only while a check runs, and a clean check leaves it usable (1 broadcast)', async () => {
    const t = await openHeld();
    await t.user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    await t.startHeldCheck();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Broadcast to/ }).disabled).toBe(true);
    t.release();
    await screen.findByText(verified(4));
    const b = await screen.findByRole<HTMLButtonElement>('button', { name: /Broadcast to/ });
    await waitFor(() => { expect(b.disabled).toBe(false); });
    await t.user.click(b);
    await screen.findByText(/The server accepted transaction/);
    expect(t.chain.broadcasts).toHaveLength(1);
  });

  it('L1: the Sign and Broadcast handlers themselves refuse while a check runs', async () => {
    const t = await openHeld();
    const signClick = reactOnClick(screen.getByRole('button', { name: 'Sign with software key' }));
    await t.startHeldCheck();
    signClick();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByText('Signed transaction')).toBeNull();
    t.release();
    await screen.findByText(verified(4));
    await t.user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    const broadcastClick = reactOnClick(screen.getByRole('button', { name: /Broadcast to/ }));
    await t.startHeldCheck();
    broadcastClick();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(t.chain.broadcasts).toHaveLength(0);
    t.release();
    await screen.findAllByText(verified(4));
  });

  it('L2: a stale Broadcast handler from before a fork check sends nothing (live-chain hash check)', async () => {
    const t = await openHeld();
    await t.user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    const stale = reactOnClick(screen.getByRole('button', { name: /Broadcast to/ }));
    forkChain(t.chain.blocks, 3, 3, 2);
    await t.user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(5));
    stale();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(t.chain.broadcasts).toHaveLength(0);
  });
});

describe('BtcView header chain: re-review fixes', () => {
  it('F1: a transaction signed before Forget cannot be broadcast while its input is unchecked', async () => {
    const chain = mockChain('regtest', walletA());
    const user = await open(chain, sharedStore().storeFor, { headersPerRound: 1, maxRounds: 2 });
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(2));
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }));
    await user.type(screen.getByLabelText('Destination address'), BCRT_DEST);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    expect(screen.queryByText('Signed transaction')).toBeNull();
    expect(screen.queryByText('Review before signing')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(2));
    expect(screen.queryByRole('button', { name: /Broadcast to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review sweep' })?.hasAttribute('disabled') ?? true).toBe(true);
    expect(chain.broadcasts).toHaveLength(0);
    // M2: after headers catch up again, the old selection is gone: nothing is re-selected and Review stays disabled.
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /Sweep [0-9a-f]{64}:1/ });
    expect(box.disabled).toBe(false);
    expect(box.checked).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(true);
  });

  it('M1: while a running check has already switched to a fork without the paying block, Sign and Broadcast refuse', async () => {
    const chain = mockChain('regtest', walletA());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let gateOn = false;
    let hits = 0;
    const fetchFn: MockChain['fetchFn'] = async (url, init) => {
      if (gateOn && url.endsWith('/blocks/5') && ++hits === 2) await gate;
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={sharedStore().storeFor} headerSyncLimits={{ headersPerRound: 1, maxRounds: 10 }} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }));
    await user.type(screen.getByLabelText('Destination address'), BCRT_DEST);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    // Round 1 of this check adopts a heavier fork that replaces the paying block; round 2 is still running.
    forkChain(chain.blocks, 3, 3, 2);
    gateOn = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await waitFor(() => { expect(hits).toBe(2); });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign with software key' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review sweep' }).disabled).toBe(true);
    release();
    await screen.findByText(verified(5));
    expect(screen.queryByRole('button', { name: /Broadcast to/ })).toBeNull();
    expect(screen.queryByText('Signed transaction')).toBeNull();
    expect(chain.broadcasts).toHaveLength(0);
  });

  it('M1: a signed transaction cannot be broadcast while a check that removes its input is running', async () => {
    const chain = mockChain('regtest', walletA());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let gateOn = false;
    let hits = 0;
    const fetchFn: MockChain['fetchFn'] = async (url, init) => {
      if (gateOn && url.endsWith('/blocks/5') && ++hits === 2) await gate;
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={sharedStore().storeFor} headerSyncLimits={{ headersPerRound: 1, maxRounds: 10 }} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }));
    await user.type(screen.getByLabelText('Destination address'), BCRT_DEST);
    await user.click(screen.getByRole('button', { name: 'Review sweep' }));
    await user.click(screen.getByRole('checkbox', { name: /I checked the destination/ }));
    await user.click(screen.getByRole('button', { name: 'Sign with software key' }));
    await screen.findByText('Signed transaction');
    forkChain(chain.blocks, 3, 3, 2);
    gateOn = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await waitFor(() => { expect(hits).toBe(2); });
    const broadcast = screen.getByRole<HTMLButtonElement>('button', { name: /Broadcast to/ });
    expect(broadcast.disabled).toBe(true);
    await user.click(broadcast);
    expect(chain.broadcasts).toHaveLength(0);
    release();
    await screen.findByText(verified(5));
    expect(chain.broadcasts).toHaveLength(0);
  });

  it('L-e: lock resets the Forget confirmation, and a network switch clears the header notes (the checked tip reset there has no visible effect: lock already cleared the results)', async () => {
    const chain = mockChain('regtest', walletA());
    const user = await open(chain, sharedStore().storeFor);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.queryByRole('button', { name: 'Delete saved headers' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.selectOptions(screen.getByLabelText('Network'), 'signet');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.queryByText(verified(4))).toBeNull();
  });

  it('F2: a chain loaded from storage is reconciled with on-screen results even when the sync does not move its tip', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    // The server is now on an equal-length fork below the paying block, and another tab saved exactly that chain.
    forkChain(chain.blocks, 2, 3, 4);
    const other = new MemoryHeaderStore();
    const { chain: b } = await loadHeaderChain(btcNetwork('regtest'), other);
    await syncHeaders({ chain: b, sources: [new EsploraHeaderSource(new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn }))], store: other });
    store.regtest.value = other.value;
    store.regtest.work = other.work;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/Resumed from 4 saved block headers/);
    expect(screen.queryByRole('checkbox', { name: /Sweep [0-9a-f]{64}:1/ })).toBeNull();
    expect(screen.getByText(/Scan results above height 1 came from blocks that are no longer on the checked chain/)).toBeTruthy();
  });

  it('F3: forgetting during a running check re-enables Scan and Update headers', async () => {
    const chain = mockChain('regtest', walletA());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let hold = false;
    const fetchFn: MockChain['fetchFn'] = async (url, init) => {
      if (hold && url.includes('/blocks/') && !url.endsWith('/tip/height')) await gate;
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={sharedStore().storeFor} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    hold = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText('Checking block headers…');
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Update headers' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Scan' }).disabled).toBe(false);
    hold = false;
    release();
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
  });

  it('F5: repeated checks never grow the chain past the size limit', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = await open(chain, store.storeFor, { maxHeaders: 3, headersPerRound: 5 });
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Update headers' }));
      await screen.findByText(/longer than the 3 headers this app keeps/);
    }
    expect((JSON.parse(store.regtest.value ?? '{}') as { headersHex: string }).headersHex.length / 160).toBe(3);
  });

  it('L6: a check that finishes after Forget changes neither the results nor the checked tip', async () => {
    const chain = mockChain('regtest', walletA());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let gateOn = false;
    let hits = 0;
    const fetchFn: MockChain['fetchFn'] = async (url, init) => {
      if (gateOn && url.endsWith('/blocks/5') && ++hits === 2) await gate;
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={sharedStore().storeFor} headerSyncLimits={{ headersPerRound: 1, maxRounds: 10 }} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    // A heavier fork replacing the paying block is adopted in round 1 of a check that is still running at Forget.
    forkChain(chain.blocks, 3, 3, 2);
    gateOn = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await waitFor(() => { expect(hits).toBe(2); });
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    release();
    await new Promise((r) => { setTimeout(r, 50); });
    // The stale check neither removed the result nor marked it checked.
    expect(screen.getByText(/1 unspent payment/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }).disabled).toBe(true);
    expect(screen.getByText(/No block headers are checked right now/)).toBeTruthy();
  });

  it('L6: a chain still loading from storage at Forget is not kept as the checked chain', async () => {
    const chain = mockChain('regtest', walletA());
    const store = new MemoryHeaderStore();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let holdLoad = false;
    const load = store.load.bind(store);
    store.load = async () => {
      const v = await load();
      if (holdLoad) await gate;
      return v;
    };
    // Saved headers reach height 2 only.
    let user = await open(chain, () => store, { headersPerRound: 1, maxRounds: 2 });
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(2));
    cleanup();
    user = await open(chain, () => store, { headersPerRound: 1, maxRounds: 1 });
    holdLoad = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(/Checking saved block headers again/);
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    release();
    await new Promise((r) => { setTimeout(r, 50); });
    holdLoad = false;
    // The next check starts at genesis (one round of one header), not from the stale height-2 chain.
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(1));
  });

  it('L5: a pending Forget confirmation does not survive a network switch', async () => {
    const chain = mockChain('regtest', walletA());
    const user = await open(chain, sharedStore().storeFor);
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    expect(screen.getByRole('button', { name: 'Delete saved headers' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Lock and forget keys' }));
    await user.selectOptions(screen.getByLabelText('Network'), 'signet');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    expect(screen.queryByRole('button', { name: 'Delete saved headers' })).toBeNull();
    // No checked headers yet: the notice does not claim a height.
    expect(screen.queryByText(/height 0/)).toBeNull();
  });
});

describe('BtcView header chain: delta review fixes', () => {
  it('after forgetting headers, a capped resync keeps results above the checked tip but does not let them be swept', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={store.storeFor} headerSyncLimits={{ headersPerRound: 1, maxRounds: 2 }} />, makeServices({ fetchFn: chain.fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.type(screen.getByLabelText(/First block height/), '1');
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(2));
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/1 unspent payment/);
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    // Resync stops at height 2 (the round cap): the payment at height 3 is not reorged, only not checked yet.
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(2));
    expect(screen.queryByText(/no longer on the checked chain/)).toBeNull();
    expect(screen.getByText(/1 unspent payment/)).toBeTruthy();
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /Sweep [0-9a-f]{64}:1/ });
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/above the checked headers \(height 2\) and cannot be swept/)).toBeTruthy();
    // Once headers catch up, it can be selected again.
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Sweep [0-9a-f]{64}:1/ }).disabled).toBe(false);
  });

  it('asks before forgetting, and can keep the headers', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    expect(screen.getByText(/Delete the saved block headers for this network\?/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(store.regtest.value).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Delete saved headers' })).toBeNull();
  });

  it('says another tab holds a heavier chain when the work-guarded save is refused', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    store.regtest.value = 'other tab';
    store.regtest.work = 1n << 200n;
    store.regtest.load = () => Promise.resolve(undefined);
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    expect(screen.getByText(/Another tab or window saved a chain with more work/)).toBeTruthy();
    expect(screen.queryByText(/downloaded and checked again from the genesis block next time/)).toBeNull();
  });

  it('an aborted sync never writes headers back after they were forgotten', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    let release: () => void = () => undefined;
    let gateOn = false;
    let hits = 0;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchFn: MockChain['fetchFn'] = async (url, init) => {
      // Round 1 reads /blocks/5 for the branch and adopts it (unsaved); round 2 probes /blocks/5 again: hold that one.
      if (gateOn && url.endsWith('/blocks/5') && ++hits === 2) await gate;
      return chain.fetchFn(url, init);
    };
    const user = userEvent.setup();
    renderWith(<BtcView headerStore={store.storeFor} headerSyncLimits={{ headersPerRound: 1, maxRounds: 10 }} />, makeServices({ fetchFn }));
    await user.selectOptions(screen.getByLabelText('Network'), 'regtest');
    await user.type(screen.getByLabelText(/Esplora server URL/), 'https://esplora.test/api');
    await user.type(screen.getByLabelText(/Or import a seed/), SEED_A);
    await user.click(screen.getByRole('button', { name: 'Import seed' }));
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await screen.findByText(verified(4));
    // A heavier fork is being synced (one header per round, so the sync has unsaved progress) when the user forgets.
    forkChain(chain.blocks, 2, 6, 5);
    gateOn = true;
    await user.click(screen.getByRole('button', { name: 'Update headers' }));
    await waitFor(() => { expect(hits).toBe(2); });
    // Forgetting is allowed while a check runs: it cancels the check.
    await user.click(screen.getByRole('button', { name: 'Forget saved headers for this network' }));
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
    await screen.findByText(/Saved block headers for this network were deleted/);
    release();
    await new Promise((r) => { setTimeout(r, 50); });
    expect(store.regtest.value).toBeUndefined();
  });
});

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
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ network: 'regtest', headersHex: chain.blocks.slice(1).map((b) => b.header).join('') });

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
    ['a tampered saved header', (t: string) => t.replace(/("headersHex":")([0-9a-f]{152})([0-9a-f]{8})/, (_m, a: string, b: string) => `${a}${b}ffffffff`)],
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
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ headersHex: chain.blocks.slice(1).map((b) => b.header).join('') });
  });

  it('fails closed on a header that breaks the chain rules: no scan runs and nothing is replaced', async () => {
    const chain = mockChain('regtest', walletA());
    const store = sharedStore();
    // Block 4 does not link to block 3 (a self-mined header with an unknown parent).
    chain.blocks[4]!.header = mineHeader('ab'.repeat(32), chain.blocks[4]!.txs, 0x207fffff, 1_700_010_000);
    const user = await open(chain, store.storeFor);
    await user.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText(/Header check failed: a header the server sent failed validation, so the server’s chain could not be evaluated\./);
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
    // Proof of work is checked while parsing (INVALID_RESPONSE): its own message, not the chain-rule one.
    await screen.findByText(/Header check failed: The server returned data this app cannot trust\./);
    expect(screen.queryByText(/could not be evaluated/)).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
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
    await user.click(screen.getByRole('button', { name: 'Delete saved headers' }));
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
    expect(JSON.parse(store.regtest.value ?? '{}')).toMatchObject({ headersHex: chain.blocks.slice(1).map((b) => b.header).join('') });
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
