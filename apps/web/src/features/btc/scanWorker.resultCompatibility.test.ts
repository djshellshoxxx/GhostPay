import { createScanState } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { coinbase, mineChain, mockChain, paymentTx, SEED_B, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { wipeFound } from './scan';
import { scanForPaymentsInWorker } from './scanWorkerClient';
import { inlineBtcScanWorker } from './scanWorker.testutil';

async function fixture(twoHistoricalBlocks = false) {
  const wallet = walletA();
  const chain = mockChain('regtest', wallet);
  if (twoHistoricalBlocks) chain.blocks.splice(0, chain.blocks.length, ...mineChain(wallet.net.genesisHash, [
    [coinbase(1), paymentTx(101, wallet, SEED_B, 50_000)],
    [coinbase(2), paymentTx(102, wallet, SEED_B, 40_000)], [coinbase(3)], [coinbase(4)],
  ]));
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore();
  const { chain: headers } = await loadHeaderChain(wallet.net, store);
  await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  return { wallet, chain, client, headers, fromHeight: 1 };
}

describe('BTC result guards preserve the current worker scanner contracts', () => {
  it('accepts a bounded local scan as unknown until the checked tip is reached', async () => {
    const f = await fixture();
    const partial = await scanForPaymentsInWorker({ ...f, toHeight: 3 }, inlineBtcScanWorker, f.chain.fetchFn);
    try {
      expect(partial).toMatchObject({ fromHeight: 1, toHeight: 3, spentStatus: 'unknown', headerAnchored: true });
      expect(partial.found).toHaveLength(1);
      expect(partial.blocks.every((block) => block.height <= 3 && f.headers.hashAt(block.height) === block.hash)).toBe(true);
      expect(f.chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
    } finally { wipeFound(partial.found); }
  });

  it('accepts an empty requested range above the checked tip', async () => {
    const f = await fixture();
    const empty = await scanForPaymentsInWorker({ ...f, fromHeight: f.headers.tipHeight + 1 }, inlineBtcScanWorker, f.chain.fetchFn);
    expect(empty).toMatchObject({ fromHeight: 5, toHeight: 4, found: [], blocks: [], spentStatus: 'local' });
  });

  it('retains per-output spent coverage while paging recovered historical matches', async () => {
    const f = await fixture(true);
    let state = createScanState('regtest', 1);
    const initial = await scanForPaymentsInWorker({ ...f, resumeState: state, onState: (next) => { state = next; } }, inlineBtcScanWorker, f.chain.fetchFn);
    wipeFound(initial.found);
    expect(state.matches).toHaveLength(2);
    expect(state.matches.map((match) => match.spentCheckedThrough)).toEqual([
      { height: 4, blockHash: f.headers.tipHash }, { height: 4, blockHash: f.headers.tipHash },
    ]);
    for (const offset of [0, 1]) {
      const page = await scanForPaymentsInWorker({ ...f, resumeState: state, recoveryLimit: 1, recoveryOffset: offset }, inlineBtcScanWorker, f.chain.fetchFn);
      try {
        expect(page.recoveredHistory).toEqual({ offset, end: offset + 1, total: 2 });
        expect(page.spentStatus).toBe('local');
        expect(page.found.map((found) => found.height)).toEqual([offset + 1]);
        expect(page.blocks).toContainEqual({ height: 4, hash: f.headers.tipHash });
      } finally { wipeFound(page.found); }
    }
    expect(f.chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  });

  it('retains checked coverage anchors above an explicitly earlier recovery limit', async () => {
    const f = await fixture();
    let state = createScanState('regtest', 1);
    const initial = await scanForPaymentsInWorker({ ...f, resumeState: state, onState: (next) => { state = next; } }, inlineBtcScanWorker, f.chain.fetchFn);
    wipeFound(initial.found);
    const earlier = await scanForPaymentsInWorker({ ...f, resumeState: state, toHeight: 2 }, inlineBtcScanWorker, f.chain.fetchFn);
    try {
      expect(earlier).toMatchObject({ fromHeight: 1, toHeight: 2, spentStatus: 'unknown', found: [], recoveredHistory: { offset: 0, end: 0, total: 0 } });
      expect(earlier.blocks).toEqual([{ height: 4, hash: f.headers.tipHash }]);
      expect(state.matches[0]?.spentCheckedThrough).toEqual({ height: 4, blockHash: f.headers.tipHash });
    } finally { wipeFound(earlier.found); }
  });
});
