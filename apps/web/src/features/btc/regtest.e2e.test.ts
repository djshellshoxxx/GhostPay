// Runs only when scripts/regtest/e2e.mjs sets GHOSTPAY_REGTEST_* (it needs a live bitcoind regtest node behind
// the Esplora shim). It drives the real feature code: scan -> review -> sign -> broadcast -> rescan.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { btcNetwork } from './network';
import { scanForPayments } from './scan';
import { reviewSweep, signSweep } from './sweep';
import { walletFromSeedHex } from './wallet';

const env = process.env;
const url = env['GHOSTPAY_REGTEST_URL'];
const seed = env['GHOSTPAY_REGTEST_SEED'];
const from = Number(env['GHOSTPAY_REGTEST_FROM'] ?? '0');
const dest = env['GHOSTPAY_REGTEST_DEST'];
const expected = BigInt(env['GHOSTPAY_REGTEST_EXPECT_SATS'] ?? '0');
const out = env['GHOSTPAY_REGTEST_OUT'];

describe.skipIf(url === undefined || seed === undefined || dest === undefined)('regtest end to end (live bitcoind)', () => {
  it('detects the silent payment, sweeps it, and sees it spent afterwards', async () => {
    const net = btcNetwork('regtest');
    const wallet = walletFromSeedHex(seed ?? '', net);
    const client = new EsploraClient({ baseUrl: url ?? '', fetchFn: (u, i) => fetch(u, i) });
    await client.checkNetwork(net);

    const first = await scanForPayments({ client, wallet, fromHeight: from });
    expect(first.found).toHaveLength(1);
    expect(first.found[0]?.amountSats).toBe(expected);

    const review = reviewSweep(wallet, first.found, dest ?? '', 2);
    const signed = await signSweep(wallet, first.found, review);
    const txid = await client.broadcast(signed.rawHex);
    expect(txid).toBe(signed.txid);

    const second = await scanForPayments({ client, wallet, fromHeight: from });
    expect(second.found).toHaveLength(0);
    expect(second.spentCount).toBe(1);
    if (out !== undefined) writeFileSync(out, JSON.stringify({ txid, sendSats: review.sendSats.toString(), feeSats: review.feeSats.toString() }));
  });
});
