import { createScanState, parseScanState, serializeScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { EsploraClient } from './esplora';
import { appendBlocks, coinbase, forkChain, mineChain, mockChain, paymentTx, SEED_B, spendTx, walletA, withTxid } from './fixtures.testutil';
import { EsploraHeaderSource, invalidateReorged, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { MAX_SCAN_MATCHES, scanForPayments, wipeFound } from './scan';

const BASE = 'https://esplora.test/api';

async function fixture() {
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  const sync = async (): Promise<void> => { await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store }); };
  await sync();
  return { wallet, chain, client, headers, sync };
}

const outspendRequests = (requests: readonly string[]): string[] => requests.filter((r) => r.includes('/outspend/'));

/** Appends one block whose only non-coinbase transaction spends `found` (the payment detected by a scan). */
function spendFound(chain: ReturnType<typeof mockChain>, found: { readonly txid: string; readonly vout: number; readonly xOnlyPublicKey: Uint8Array }): void {
  const prev = { txid: found.txid, vout: found.vout, scriptpubkey: `5120${bytesToHex(found.xOnlyPublicKey)}` };
  appendBlocks(chain.blocks, [[coinbase(chain.blocks.length), spendTx(chain.blocks.length, prev)]]);
}

describe('local spend tracking (spec 12): spent status without per-outpoint provider queries', () => {
  it('reports unknown while the local range stops before the known chain tip', async () => {
    const f = await fixture();
    const result = await scanForPayments({ ...f, fromHeight: 1, toHeight: 3 });
    expect(result.found).toHaveLength(1);
    expect(result.spentStatus).toBe('unknown');
    expect(outspendRequests(f.chain.requests)).toEqual([]);
    wipeFound(result.found);
  });

  it('does not trust a lower provider tip to erase already checked later headers', async () => {
    const f = await fixture(); vi.spyOn(f.client, 'tipHeight').mockResolvedValue(3);
    const result = await scanForPayments({ ...f, fromHeight: 1 });
    expect(result.found).toHaveLength(1); expect(result.spentStatus).toBe('unknown');
    expect(outspendRequests(f.chain.requests)).toEqual([]); wipeFound(result.found);
  });

  it('retains a coverage-tip hash on a resumed-at-tip result so an unseen suffix fork invalidates it', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    wipeFound(first.found);
    const recovered = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(recovered.spentStatus).toBe('local');
    expect(recovered.blocks).toContainEqual({ height: saved.lastHeight, hash: saved.lastHash });
    // The payment's creation block remains canonical; only the old coverage suffix changes.
    forkChain(f.chain.blocks, saved.lastHeight, 2, 902); await f.sync();
    const invalidated = invalidateReorged(recovered, f.headers).scan;
    expect(invalidated?.spentStatus).toBe('unknown'); expect(invalidated?.toHeight).toBe(saved.lastHeight - 1);
    wipeFound(recovered.found);
  });

  it('keeps historical spentness unknown after restoring a legacy checkpoint and permits an explicit provider refresh', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    const paid = first.found[0]!; wipeFound(first.found);
    // Simulate a pre-tracking checkpoint that already passed the later spending block.
    spendFound(f.chain, paid); await f.sync();
    const legacy = JSON.parse(serializeScanState(saved)) as Record<string, unknown>;
    delete legacy['spendsFromHeight'];
    const last = f.chain.blocks.length - 1;
    legacy['lastHeight'] = last; legacy['lastHash'] = f.chain.blocks[last]!.hash;
    legacy['recent'] = f.chain.blocks.slice(1).map((b, i) => ({ height: i + 1, hash: b.hash }));
    saved = parseScanState(JSON.stringify(legacy));
    f.chain.requests.length = 0;
    const unknown = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(unknown.found).toHaveLength(1); expect(unknown.spentStatus).toBe('unknown');
    expect(outspendRequests(f.chain.requests)).toEqual([]); wipeFound(unknown.found);
    f.chain.spent.add(`${paid.txid}:${String(paid.vout)}`);
    const checked = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, providerSpentCheck: true });
    expect(checked.spentStatus).toBe('provider'); expect(checked.found).toEqual([]); expect(checked.spentCount).toBe(1);
    const fresh = await scanForPayments({ ...f, fromHeight: 1, resumeState: createScanState('regtest', 1) });
    expect(fresh.spentStatus).toBe('local'); expect(fresh.found).toEqual([]); expect(fresh.spentCount).toBe(1);
  });

  it('rejects light scans without explicit provider consent before any request', async () => {
    const f = await fixture(); f.chain.requests.length = 0;
    await expect(scanForPayments({ ...f, fromHeight: 1, oracle: { kind: 'http', url: 'https://oracle.test', mode: 'light' },
      readOracle: () => Promise.reject(new Error('should not read')) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(f.chain.requests).toEqual([]);
  });

  it('restores a canonical output after its spending block is orphaned, including a serialized reload', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    const paid = first.found[0]!; wipeFound(first.found); spendFound(f.chain, paid); await f.sync();
    const spent = await scanForPayments({ ...f, fromHeight: 1, resumeState: parseScanState(serializeScanState(saved)), onState: (s) => { saved = s; } });
    expect(spent.found).toEqual([]); expect(saved.matches[0]?.spent).toBeDefined();
    const spendingHeight = f.chain.blocks.length - 1;
    forkChain(f.chain.blocks, spendingHeight, 2, 901); await f.sync();
    const restored = await scanForPayments({ ...f, fromHeight: 1, resumeState: parseScanState(serializeScanState(saved)), onState: (s) => { saved = s; } });
    expect(restored.found.map((m) => `${m.txid}:${String(m.vout)}`)).toEqual([`${paid.txid}:${String(paid.vout)}`]);
    expect(restored.spentStatus).toBe('local'); expect(saved.matches[0]?.spent).toBeUndefined();
    expect(outspendRequests(f.chain.requests)).toEqual([]); wipeFound(restored.found);
  });

  it('does not extend historical coverage to an output first discovered while revalidating another match', async () => {
    const wallet = walletA(); const chain = mockChain('regtest', wallet);
    const a = paymentTx(201, wallet, SEED_B, 30_000); const b = paymentTx(202, wallet, SEED_B, 40_000);
    chain.blocks.splice(0, chain.blocks.length, ...mineChain(wallet.net.genesisHash, [
      [coinbase(1), a, b], [coinbase(2), spendTx(203, { txid: b.txid, vout: 1, scriptpubkey: b.vout[1]!.scriptpubkey })],
    ]));
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    const { chain: headers } = await loadHeaderChain(wallet.net, new MemoryHeaderStore());
    await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store: new MemoryHeaderStore() });
    let state = createScanState('regtest', 1);
    const first = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state, onState: (s) => { state = s; } });
    expect(state.matches).toHaveLength(2); expect(state.matches.find((m) => m.txid === b.txid)?.spent).toBeDefined(); wipeFound(first.found);
    // A prior oracle can omit B's matching tweak while still serving both committed outputs and all block inputs.
    // Those inputs were scanned, but B was not yet a watched outpoint, so its old spend cannot be inferred now.
    state = { ...state, spendsFromHeight: 1, matches: state.matches.filter((m) => m.txid === a.txid) };
    const recovered = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state });
    expect(recovered.found.map((m) => m.txid).sort()).toEqual([a.txid, b.txid].sort());
    expect(recovered.spentStatus).toBe('unknown'); wipeFound(recovered.found);
  });

  it('retains a saved spent mark while revalidating its block for another unspent match at the tip', async () => {
    const wallet = walletA(); const chain = mockChain('regtest', wallet);
    const a = paymentTx(205, wallet, SEED_B, 30_000); const b = paymentTx(206, wallet, SEED_B, 40_000);
    chain.blocks.splice(0, chain.blocks.length, ...mineChain(wallet.net.genesisHash, [
      [coinbase(1), a, b], [coinbase(2), spendTx(207, { txid: b.txid, vout: 1, scriptpubkey: b.vout[1]!.scriptpubkey })],
    ]));
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }); const store = new MemoryHeaderStore();
    const { chain: headers } = await loadHeaderChain(wallet.net, store);
    await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
    let state = createScanState('regtest', 1);
    const first = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: state, onState: (s) => { state = s; } });
    expect(first.found.map((m) => m.txid)).toEqual([a.txid]); expect(state.matches.find((m) => m.txid === b.txid)?.spent).toBeDefined(); wipeFound(first.found);
    const recovered = await scanForPayments({ client, wallet, headers, fromHeight: 1, resumeState: parseScanState(serializeScanState(state)) });
    expect(recovered.found.map((m) => m.txid)).toEqual([a.txid]); expect(recovered.spentCount).toBe(1);
    expect(recovered.spentStatus).toBe('local'); expect(outspendRequests(chain.requests)).toEqual([]); wipeFound(recovered.found);
  });

  it('bounds output matches even when many outpoints share one spend-tweak buffer', async () => {
    const wallet = walletA(); const chain = mockChain('regtest', wallet);
    const payment = paymentTx(204, wallet, SEED_B, 1);
    const many = withTxid({ ...payment, vout: Array.from({ length: MAX_SCAN_MATCHES + 1 }, () => ({ ...payment.vout[1]! })) });
    chain.blocks.splice(0, chain.blocks.length, ...mineChain(wallet.net.genesisHash, [[coinbase(1), many]]));
    const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
    await expect(scanForPayments({ client, wallet, fromHeight: 1 }).then((r) => { const count = r.found.length; wipeFound(r.found); return count; }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(outspendRequests(chain.requests)).toEqual([]);
  });

  it('drops a payment spent in a later scanned block, without asking the server about any outpoint', async () => {
    const f = await fixture();
    const first = await scanForPayments({ ...f, fromHeight: 1 });
    expect(first.found).toHaveLength(1); expect(first.spentStatus).toBe('local');
    expect(outspendRequests(f.chain.requests)).toEqual([]);
    const paid = first.found[0]!;
    spendFound(f.chain, paid); wipeFound(first.found); await f.sync();
    f.chain.requests.length = 0;
    const second = await scanForPayments({ ...f, fromHeight: 1 });
    expect(second.found).toEqual([]); expect(second.spentCount).toBe(1); expect(second.spentStatus).toBe('local');
    expect(outspendRequests(f.chain.requests)).toEqual([]);
    // The spending block was downloaded once for its tweaks; the spends come from that same download.
    const spendingHash = f.chain.blocks[f.chain.blocks.length - 1]!.hash;
    expect(f.chain.requests.filter((r) => r === `GET /block/${spendingHash}/txs/0`)).toHaveLength(1);
  });

  it('asks the server per outpoint only with providerSpentCheck, and then reports the server as the source', async () => {
    const f = await fixture();
    const res = await scanForPayments({ ...f, fromHeight: 1, providerSpentCheck: true });
    expect(res.found).toHaveLength(1); expect(res.spentStatus).toBe('provider');
    const paid = res.found[0]!;
    expect(outspendRequests(f.chain.requests)).toEqual([`GET /tx/${paid.txid}/outspend/${String(paid.vout)}`]);
    // The server's word still wins there: a mempool spend it knows about hides the output.
    f.chain.spent.add(`${paid.txid}:${String(paid.vout)}`); wipeFound(res.found);
    const again = await scanForPayments({ ...f, fromHeight: 1, providerSpentCheck: true });
    expect(again.found).toEqual([]); expect(again.spentCount).toBe(1);
  });

  it('records the spend of a persisted match in the resumed state and stops offering it, with no outpoint query', async () => {
    const f = await fixture(); let saved: ScanState = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    expect(first.found).toHaveLength(1); expect(saved.matches).toHaveLength(1); expect(saved.matches[0]!.spent).toBeUndefined();
    const paid = first.found[0]!; wipeFound(first.found);
    spendFound(f.chain, paid); await f.sync();
    f.chain.requests.length = 0;
    const second = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    expect(second.found).toEqual([]); expect(second.spentCount).toBe(1); expect(second.spentStatus).toBe('local');
    expect(saved.matches[0]!.spent).toMatchObject({ height: f.chain.blocks.length - 1, blockHash: f.chain.blocks[f.chain.blocks.length - 1]!.hash });
    expect(outspendRequests(f.chain.requests)).toEqual([]);
    // A later resume no longer re-derives the spent match (it is not re-read) and finds nothing new.
    f.chain.requests.length = 0;
    const third = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s: ScanState) => { saved = s; } });
    expect(third.found).toEqual([]); expect(third.spentCount).toBe(0);
    expect(f.chain.requests).not.toContain(`GET /block-height/${String(paid.height)}`);
  });
});
