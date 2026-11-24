import { createScanState, parseHeader, type ScanState } from '@ghostpay/btc-silent-payments';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { mockChain, forkChain, walletA, mineChain, mineHeader, coinbase, paymentTx, SEED_B, blockTime } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { scanForPayments, wipeFound } from './scan';

async function fixture() {
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  return { wallet, chain, client, headers, store };
}

describe('BTC per-block scan restart', () => {
  it('saves each completed block and resumes without fetching earlier empty blocks', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1); const heights: number[] = [];
    const first = await scanForPayments({ ...f, fromHeight: 1, toHeight: 2, resumeState: saved,
      onState: (state: ScanState) => { saved = state; heights.push(state.lastHeight); } });
    expect(heights).toEqual([1, 2]); expect(saved.lastHeight).toBe(2); wipeFound(first.found);
    f.chain.requests.length = 0;
    const second = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved,
      onState: (state: ScanState) => { saved = state; } });
    expect(second.found).toHaveLength(1); expect(saved.lastHeight).toBe(f.chain.blocks.length - 1);
    expect(f.chain.requests).not.toContain('GET /block-height/1');
    expect(f.chain.requests).not.toContain('GET /block-height/2'); wipeFound(second.found);
  });

  it('revalidates saved matches and regenerates tweaks before making outputs spendable', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    const output = first.found[0]!; const tweak = new Uint8Array(output.spendTweak); wipeFound(first.found);
    expect(saved.matches).toHaveLength(1); expect('spendTweak' in saved.matches[0]!).toBe(false);
    f.chain.requests.length = 0;
    const second = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(Array.from(second.found[0]!.spendTweak)).toEqual(Array.from(tweak));
    expect(f.chain.requests).toContain('GET /block-height/3');
    expect(f.chain.requests).not.toContain('GET /block-height/1'); wipeFound(second.found);
  });

  it('rolls back persisted metadata and never revives a match removed by a fork', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    wipeFound(first.found); forkChain(f.chain.blocks, 3, 4, 900);
    await syncHeaders({ chain: f.headers, sources: [new EsploraHeaderSource(f.client)], store: f.store });
    const second = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    expect(second.found).toHaveLength(0); expect(saved.matches[0]?.status).toBe('pending'); expect(saved.lastHeight).toBe(6);
  });

  it('paginates prior payment blocks while advancing the new cursor without dropping history', async () => {
    const wallet = walletA(); const chain = mockChain('regtest', wallet);
    chain.blocks.splice(0, chain.blocks.length, ...mineChain(wallet.net.genesisHash, [
      [coinbase(1), paymentTx(101, wallet, SEED_B, 50_000)],
      [coinbase(2), paymentTx(102, wallet, SEED_B, 40_000)], [coinbase(3)],
    ]));
    const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
    const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
    await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
    let state = createScanState('regtest', 1);
    const first = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state, onState: (s) => { state = s; } });
    expect(state.matches).toHaveLength(2); wipeFound(first.found);
    const txs = [coinbase(4)]; const header = mineHeader(chain.blocks[3]!.hash, txs, 0x207fffff, blockTime(4));
    chain.blocks.push({ txs, header, hash: parseHeader(header).hash });
    await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
    chain.requests.length = 0;
    const page1 = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state, recoveryLimit: 1, onState: (s) => { state = s; } });
    expect(page1.recoveredHistory).toEqual({ offset: 0, end: 1, total: 2 });
    expect(page1.found.map((m) => m.height)).toEqual([1]); expect(state.lastHeight).toBe(4);
    expect(state.matches).toHaveLength(2); expect(chain.requests).not.toContain('GET /block-height/2'); wipeFound(page1.found);
    chain.requests.length = 0;
    const page2 = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state, recoveryLimit: 1, recoveryOffset: 1 });
    expect(page2.recoveredHistory).toEqual({ offset: 1, end: 2, total: 2 });
    expect(page2.found.map((m) => m.height)).toEqual([2]);
    expect(chain.requests).not.toContain('GET /block-height/1'); wipeFound(page2.found);
  });

  it('persists only completed blocks and resumes after cancellation', async () => {
    const f = await fixture(); const ac = new AbortController(); let saved = createScanState('regtest', 1);
    await expect(scanForPayments({ ...f, fromHeight: 1, signal: ac.signal, resumeState: saved,
      onState: (s: ScanState) => { saved = s; if (s.lastHeight === 2) ac.abort(); } })).rejects.toThrow();
    expect(saved.lastHeight).toBe(2);
    const recovered = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(recovered.found).toHaveLength(1); wipeFound(recovered.found);
  });
});
