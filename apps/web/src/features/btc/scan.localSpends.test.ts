import { describe, expect, it } from 'vitest';
import { btcNetwork } from './network';
import { EsploraClient, EsploraTweakSource } from './esplora';
import { coinbase, decoyTx, mineChain, mockChain, paymentTx, SEED_B, spendManyTx, walletA, type MockChain } from './fixtures.testutil';
import { scanForPayments, wipeFound } from './scan';

const BASE = 'https://esplora.test/api';
const outspendRequests = (chain: MockChain): string[] => chain.requests.filter((r) => r.includes('/outspend/'));

/** Block 1 holds two payments to the wallet; `later` supplies blocks 2 and up. */
function setup(later: (pay: { txid: string }, pay2: { txid: string }) => ReturnType<typeof coinbase>[][]) {
  const wallet = walletA();
  const chain = mockChain('regtest', wallet);
  const pay = paymentTx(101, wallet, SEED_B, 50_000);
  const pay2 = paymentTx(102, wallet, SEED_B, 40_000);
  const bodies = [[coinbase(1), decoyTx(1, SEED_B), pay, pay2], ...later(pay, pay2)];
  chain.blocks.splice(0, chain.blocks.length, ...mineChain(btcNetwork('regtest').genesisHash, bodies));
  return { wallet, chain, pay, pay2, client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }) };
}

describe('BTC spend detection from the scanned blocks (TM13)', () => {
  it('sees a spend in a later scanned block without asking the server about any output', async () => {
    const f = setup((pay) => [[coinbase(2)], [coinbase(3), spendManyTx(1, [{ txid: pay.txid, vout: 1 }])], [coinbase(4)]]);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0 });
    expect(res.spentCount).toBe(1);
    expect(res.found.map((x) => x.txid)).toEqual([f.pay2.txid]);
    expect(outspendRequests(f.chain)).toEqual([]);
    wipeFound(res.found);
  });

  it('rejects a forged coinbase annotation without querying any output', async () => {
    const f = setup((pay) => [[coinbase(2), spendManyTx(1, [{ txid: pay.txid, vout: 1 }])]]);
    const spendingTx = f.chain.blocks[2]?.txs[1];
    if (spendingTx === undefined) throw new Error('missing spending fixture');
    // This annotation is outside the serialized transaction: txid, witness and mined header remain unchanged.
    spendingTx.vin[0]!.is_coinbase = true;
    await expect(scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(outspendRequests(f.chain)).toEqual([]);
  });

  it('sees a spend in the same block as the payment', async () => {
    const wallet = walletA();
    const chain = mockChain('regtest', wallet);
    const pay = paymentTx(101, wallet, SEED_B, 50_000);
    chain.blocks.splice(0, chain.blocks.length, ...mineChain(btcNetwork('regtest').genesisHash, [
      [coinbase(1), pay, spendManyTx(2, [{ txid: pay.txid, vout: 1 }])], [coinbase(2)],
    ]));
    const res = await scanForPayments({ client: new EsploraClient({ baseUrl: BASE, fetchFn: chain.fetchFn }), wallet, fromHeight: 0 });
    expect(res.spentCount).toBe(1);
    expect(res.found).toHaveLength(0);
    expect(outspendRequests(chain)).toEqual([]);
  });

  it('also catches a spend that only some inputs of a multi-input transaction carry', async () => {
    const f = setup((pay, pay2) => [[coinbase(2), spendManyTx(3, [{ txid: f0(), vout: 0 }, { txid: pay2.txid, vout: 1 }, { txid: pay.txid, vout: 0 }])]]);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0 });
    // Only output 1 of the payments is the silent payment output; outpoint (pay, 0) is the change output and is not ours.
    expect(res.spentCount).toBe(1);
    expect(res.found.map((x) => x.txid)).toEqual([f.pay.txid]);
    expect(outspendRequests(f.chain)).toEqual([]);
    wipeFound(res.found);
  });

  it('keeps unspent outputs unspent and asks the server about none of them when every block up to the tip was read', async () => {
    const f = setup(() => [[coinbase(2)], [coinbase(3)]]);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0 });
    expect(res.found).toHaveLength(2);
    expect(res.spentCount).toBe(0);
    expect(outspendRequests(f.chain)).toEqual([]);
    wipeFound(res.found);
  });

  it('keeps a partial scan unknown and does not silently query outputs', async () => {
    const f = setup((pay) => [[coinbase(2)], [coinbase(3), spendManyTx(1, [{ txid: pay.txid, vout: 1 }])]]);
    f.chain.spent.add(`${f.pay.txid}:1`);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0, toHeight: 2 });
    expect(res.toHeight).toBe(2);
    expect(res.spentStatus).toBe('unknown');
    expect(res.spentCount).toBe(0);
    expect(res.found).toHaveLength(2);
    expect(outspendRequests(f.chain)).toEqual([]);
    wipeFound(res.found);
  });

  it('queries incomplete-history outputs only when the caller explicitly authorizes provider checks', async () => {
    const f = setup((pay) => [[coinbase(2)], [coinbase(3), spendManyTx(1, [{ txid: pay.txid, vout: 1 }])]]);
    f.chain.spent.add(`${f.pay.txid}:1`);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0, toHeight: 2, providerSpentCheck: true });
    expect(res.spentStatus).toBe('provider');
    expect(res.spentCount).toBe(1);
    expect(res.found.map((x) => x.txid)).toEqual([f.pay2.txid]);
    expect(outspendRequests(f.chain)).toHaveLength(2);
    wipeFound(res.found);
  });

  it('returns committed block inputs without attaching an unrelated watched-output verdict', async () => {
    const f = setup((pay) => [[coinbase(2)], [coinbase(3), spendManyTx(1, [{ txid: pay.txid, vout: 1 }])]]);
    const source = new EsploraTweakSource(f.client, btcNetwork('regtest'));
    expect((await source.getSpends(2)).spends).toEqual([]);
    const spends = await source.getSpends(3);
    expect(spends.spends).toContainEqual({ txid: f.pay.txid, vout: 1, spentBy: f.chain.blocks[3]!.txs[1]!.txid });
    const requests = f.chain.requests.length;
    expect(await source.getSpends(3)).toEqual(spends);
    expect(f.chain.requests).toHaveLength(requests);
    expect(outspendRequests(f.chain)).toEqual([]);
  });

  it('cannot see the mempool: a spend only the server knows needs a separate explicit provider query', async () => {
    const f = setup(() => [[coinbase(2)]]);
    f.chain.spent.add(`${f.pay.txid}:1`);
    const res = await scanForPayments({ client: f.client, wallet: f.wallet, fromHeight: 0 });
    expect(res.found).toHaveLength(2);
    expect(await f.client.isUnspent(f.pay.txid, 1)).toBe(false);
    wipeFound(res.found);
  });
});

function f0(): string { return 'ab'.repeat(32); }
