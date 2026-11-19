import { createScanState, parseScanState, serializeScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { EsploraClient } from './esplora';
import { appendBlocks, coinbase, forkChain, mockChain, paymentTx, SEED_B, spendTx, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, invalidateReorged, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { MAX_SCAN_MATCHES, scanForPayments, wipeFound } from './scan';
import { oracleFixture } from './oracle.testutil';
import { BtcScanVault } from './scanStore';
import type { ReconciliationVaultStore } from '../../lib/reconciliationVault';

const BASE = 'https://esplora.test/api';
async function fixture() {
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  const sync = () => syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  await sync();
  return { wallet, chain, client, headers, sync };
}
function legacy(state: ScanState): ScanState {
  const decoded = JSON.parse(serializeScanState(state)) as { matches: Record<string, unknown>[] };
  for (const match of decoded.matches) { delete match['spent']; delete match['spentCheckedThrough']; }
  return parseScanState(JSON.stringify(decoded));
}
function spendFound(f: Awaited<ReturnType<typeof fixture>>, found: Awaited<ReturnType<typeof scanForPayments>>['found'][number]): void {
  appendBlocks(f.chain.blocks, [[coinbase(f.chain.blocks.length), spendTx(f.chain.blocks.length,
    { txid: found.txid, vout: found.vout, scriptpubkey: `5120${bytesToHex(found.xOnlyPublicKey)}` })]]);
}
const queries = (f: Awaited<ReturnType<typeof fixture>>) => f.chain.requests.filter((r) => r.includes('/outspend/'));

describe('Bitcoin spentness qualification regressions', () => {
  it('rejects oversized resumed output metadata before requesting any source data', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    wipeFound(first.found);
    const oversized = { ...saved, matches: Array.from({ length: MAX_SCAN_MATCHES + 1 }, (_, vout) => ({ ...saved.matches[0]!, vout })) };
    f.chain.requests.length = 0;
    await expect(scanForPayments({ ...f, fromHeight: 1, resumeState: oversized })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(f.chain.requests).toEqual([]);
  });

  it('keeps a partial local range unknown until the rest of the chain has been scanned', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const partial = await scanForPayments({ ...f, fromHeight: 1, toHeight: 3, resumeState: saved, onState: (s) => { saved = s; } });
    expect(partial.found).toHaveLength(1); expect(partial.spentStatus).toBe('unknown'); wipeFound(partial.found);
    const complete = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(complete.found).toHaveLength(1); expect(complete.spentStatus).toBe('local');
    expect(queries(f)).toEqual([]); wipeFound(complete.found);
  });

  it('does not classify legacy history as locally unspent when its spend occurred before the saved cursor', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    const paid = first.found[0]!; spendFound(f, paid); wipeFound(first.found); await f.sync();
    await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    saved = legacy(saved); f.chain.requests.length = 0;
    const resumed = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(resumed.found).toHaveLength(1); expect(resumed.spentStatus).toBe('unknown');
    expect(queries(f)).toEqual([]); wipeFound(resumed.found);
    const fresh = await scanForPayments({ ...f, fromHeight: 1, resumeState: createScanState('regtest', 1) });
    expect(fresh.found).toEqual([]); expect(fresh.spentCount).toBe(1); expect(fresh.spentStatus).toBe('local');
    f.chain.spent.add(`${paid.txid}:${String(paid.vout)}`);
    const authorized = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, providerSpentCheck: true });
    expect(authorized.found).toEqual([]); expect(authorized.spentStatus).toBe('provider'); expect(queries(f)).toHaveLength(1);
  });

  it('keeps local status unknown when a lagging provider omits blocks already known to the header chain', async () => {
    const f = await fixture(); const first = await scanForPayments({ ...f, fromHeight: 1 });
    spendFound(f, first.found[0]!); wipeFound(first.found); await f.sync();
    vi.spyOn(f.client, 'tipHeight').mockResolvedValue(4);
    const lagging = await scanForPayments({ ...f, fromHeight: 1 });
    expect(f.headers.tipHeight).toBe(5); expect(lagging.toHeight).toBe(4);
    expect(lagging.found).toHaveLength(1); expect(lagging.spentStatus).toBe('unknown');
    expect(queries(f)).toEqual([]); wipeFound(lagging.found);
  });

  it('retains a chain anchor even when resumed history contains only already-spent outputs', async () => {
    const f = await fixture(); let saved = createScanState('regtest', 1);
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    spendFound(f, first.found[0]!); wipeFound(first.found); await f.sync();
    await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: (s) => { saved = s; } });
    const restored = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(restored.found).toEqual([]);
    expect(restored.blocks).toContainEqual({ height: saved.lastHeight, hash: saved.lastHash });
    forkChain(f.chain.blocks, 5, 2, 701); await f.sync();
    expect(invalidateReorged(restored, f.headers).scan?.spentStatus).toBe('unknown');
    const canonical = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(canonical.found).toHaveLength(1); wipeFound(canonical.found);
  });

  it('restores encrypted coverage and spends through two vault reloads, and rolls back an orphaned spend', async () => {
    const f = await fixture(); const values = new Map<string, string>();
    const store: ReconciliationVaultStore = {
      read: (key) => Promise.resolve(values.get(key) ?? null),
      compareAndSwap: (key, expected, next, guard) => {
        guard(); if ((values.get(key) ?? null) !== expected) return Promise.resolve(false);
        values.set(key, next); return Promise.resolve(true);
      },
    };
    const one = await BtcScanVault.open(f.wallet, store, () => undefined); await one.load();
    const first = await scanForPayments({ ...f, fromHeight: 1, resumeState: createScanState('regtest', 1), onState: (s) => one.save(s) });
    const paid = first.found[0]!; wipeFound(first.found); one.lock();
    const two = await BtcScanVault.open(f.wallet, store, () => undefined); const restored = (await two.load())!;
    expect(restored.matches[0]?.spentCheckedThrough?.height).toBe(4);
    spendFound(f, paid); await f.sync();
    const second = await scanForPayments({ ...f, fromHeight: 1, resumeState: restored, onState: (s) => two.save(s) });
    expect(second.found).toEqual([]); expect(second.spentCount).toBe(1); two.lock();
    const three = await BtcScanVault.open(f.wallet, store, () => undefined); let saved = (await three.load())!;
    expect(saved.matches[0]?.spent?.height).toBe(5);
    const third = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved });
    expect(third.found).toEqual([]);
    forkChain(f.chain.blocks, 5, 2, 700); await f.sync();
    const canonical = await scanForPayments({ ...f, fromHeight: 1, resumeState: saved, onState: async (s) => { saved = s; await three.save(s); } });
    expect(canonical.found).toHaveLength(1); expect(canonical.spentStatus).toBe('local');
    expect(saved.matches[0]?.spent).toBeUndefined(); expect(saved.matches[0]?.spentCheckedThrough?.height).toBe(6);
    expect(queries(f)).toEqual([]); wipeFound(canonical.found); three.lock();
  });

  it.each([undefined, false])('refuses light mode without explicit provider consent (%s) before source requests', async (providerSpentCheck) => {
    const f = await oracleFixture(); const fetchFn = vi.fn(f.fetchFn);
    const client = new EsploraClient({ baseUrl: BASE, fetchFn });
    await expect(scanForPayments({ ...f, client, oracle: { kind: 'http', mode: 'light', url: 'https://oracle.test' },
      readOracle: (height) => Promise.resolve(f.blocks.get(height)!), ...(providerSpentCheck === undefined ? {} : { providerSpentCheck }),
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops optional checks between outputs when an injected client completes after abort', async () => {
    const f = await fixture(); appendBlocks(f.chain.blocks, [[coinbase(5), paymentTx(505, f.wallet, SEED_B, 40_000)]]); await f.sync();
    const abort = new AbortController(); const check = vi.spyOn(f.client, 'isUnspent').mockImplementation(() => { abort.abort(); return Promise.resolve(true); });
    await expect(scanForPayments({ ...f, fromHeight: 1, providerSpentCheck: true, signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(check).toHaveBeenCalledTimes(1);
  });
});
