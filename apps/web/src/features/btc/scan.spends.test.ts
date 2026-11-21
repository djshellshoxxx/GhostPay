import { createScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { appendBlocks, coinbase, mockChain, spendTx, walletA } from './fixtures.testutil';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from './headers';
import { scanForPayments, wipeFound } from './scan';

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
