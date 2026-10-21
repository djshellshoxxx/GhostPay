import { hexToBytes } from '@noble/hashes/utils.js';
import { Address, NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { toHex } from './ecc.js';
import { publicKeyOf } from './keys.js';
import { createLabelTable } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak } from './receiver.js';
import { secretScalarFromBytes } from './secret.js';
import { buildSpendTransaction, verifyKeyPathSpend, type SpendableOutput } from './spend.js';
import { toBytesLike } from './spend.testutil.js';
import { txInputFromHex } from './tx.js';
import { loadSendReceiveVectors } from './vectors.testutil.js';

const dest = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(3) });

describe('spending the outputs found in the official BIP-352 receiving vectors', () => {
  it('signs and verifies a sweep for every vector with found outputs (labels included)', () => {
    let spent = 0;
    let labeled = 0;
    for (const c of loadSendReceiveVectors()) {
      for (const r of c.receiving) {
        if ((r.expected.outputs ?? []).length === 0) continue;
        const scanSecret = secretScalarFromBytes(hexToBytes(r.given.key_material.scan_priv_key));
        const spendSecret = secretScalarFromBytes(hexToBytes(r.given.key_material.spend_priv_key));
        const inputs = r.given.vin.map((v) =>
          txInputFromHex({
            txid: v.txid,
            vout: v.vout,
            scriptSig: v.scriptSig,
            txinwitness: v.txinwitness,
            prevoutScriptPubKey: v.prevout.scriptPubKey.hex,
          }),
        );
        const tw = computeTransactionTweak(inputs);
        expect(tw).not.toBeNull();
        const found = scanOutputsForTweak(
          {
            scanSecret,
            spendPublicKey: publicKeyOf(spendSecret),
            labels: createLabelTable(scanSecret, r.given.labels),
          },
          (tw as { tweak: Uint8Array }).tweak,
          r.given.outputs.map((o) => hexToBytes(o)),
        );
        expect(found.length).toBeGreaterThan(0);
        labeled += found.filter((f) => f.label !== null).length;
        const funding = 'ab'.repeat(32);
        const outs: SpendableOutput[] = found.map((f, i) => ({
          txid: funding,
          vout: i,
          amountSats: 25_000n,
          xOnlyPublicKey: f.xOnlyPublicKey,
          spendTweak: f.spendTweak,
        }));
        const res = buildSpendTransaction({
          outputs: outs,
          spendSecret,
          destinations: [{ address: dest }],
          feeRate: 3,
          network: 'mainnet',
        });
        const prev = outs.map((o) => ({ script: toBytesLike(o.xOnlyPublicKey), amountSats: o.amountSats }));
        expect(verifyKeyPathSpend(res.rawTx, prev)).toBe(true);
        expect(toHex(res.rawTx).length).toBeGreaterThan(0);
        spent += found.length;
      }
    }
    expect(spent).toBeGreaterThan(20);
    expect(labeled).toBeGreaterThan(0);
  });
});
