import { parseHeader } from '@ghostpay/btc-silent-payments';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsploraClient } from './esplora';
import { coinbase, mineHeader, mockChain, walletA, withTxid, withWitnessCommitment } from './fixtures.testutil';
import { scanForPayments } from './scan';

const observed = vi.hoisted(() => ({ tweaks: [] as Uint8Array[] }));

// Observe the real spend tweaks as they leave the package scanner. Scanning, matching and parsing are not replaced.
vi.mock('@ghostpay/btc-silent-payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/btc-silent-payments')>();
  return {
    ...actual,
    async *scanBlocks(...args: Parameters<typeof actual.scanBlocks>) {
      for await (const r of actual.scanBlocks(...args)) {
        observed.tweaks.push(r.spendTweak);
        yield r;
      }
    },
  };
});

const BASE = 'https://esplora.test/api';
const wiped = (b: Uint8Array | undefined): boolean => b !== undefined && b.every((x) => x === 0);

describe('Bitcoin scan spend-tweak cleanup', () => {
  beforeEach(() => { observed.tweaks.length = 0; });
  afterEach(() => { for (const t of observed.tweaks) t.fill(0); });

  it('wipes the tweak of an output that is already spent and keeps the returned ones intact', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w, { payments: 2 });
    const spentTx = chain.blocks[3]!.txs[2]!.txid;
    chain.spent.add(`${spentTx}:1`);
    const res = await scanForPayments({ client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), wallet: w, fromHeight: 0 });
    expect(res.spentCount).toBe(1);
    expect(res.found).toHaveLength(1);
    expect(observed.tweaks).toHaveLength(2);
    const kept = res.found[0]!.spendTweak;
    expect(wiped(kept)).toBe(false);
    expect(observed.tweaks.filter((t) => t !== kept).every(wiped)).toBe(true);
  });

  it('wipes every tweak when the scan fails after outputs were detected', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    chain.failPath = `/tx/${chain.blocks[3]!.txs[2]!.txid}/outspend/1`;
    await expect(scanForPayments({ client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), wallet: w, fromHeight: 0 }))
      .rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    expect(observed.tweaks).toHaveLength(1);
    expect(observed.tweaks.every(wiped)).toBe(true);
  });

  it('keeps a tweak that a returned output shares with a dropped output paying the same key', async () => {
    const w = walletA();
    const chain = mockChain('regtest', w);
    const blk = chain.blocks[3]!;
    const pay = blk.txs[2]!;
    // One payment transaction with two outputs to the same one-time key: one scanner hit, two outputs.
    const twin = withTxid({ ...pay, vout: [...pay.vout, pay.vout[1]!] });
    blk.txs = withWitnessCommitment([coinbase(3), blk.txs[1]!, twin]);
    blk.header = mineHeader(chain.blocks[2]!.hash, blk.txs);
    blk.hash = parseHeader(blk.header).hash;
    chain.spent.add(`${twin.txid}:1`);
    const res = await scanForPayments({ client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), wallet: w, fromHeight: 3, toHeight: 3 });
    expect(res.found.map((f) => f.vout)).toEqual([2]);
    expect(res.spentCount).toBe(1);
    expect(observed.tweaks).toHaveLength(2);
    expect(observed.tweaks[0]).toBe(observed.tweaks[1]);
    expect(wiped(res.found[0]?.spendTweak)).toBe(false);
  });
});
