import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import { decodeAddress, encodeAddress } from './address.js';
import { toHex } from './ecc.js';
import { BtcFamilyError } from './errors.js';
import { extractInputPublicKey } from './inputs.js';
import { createLabelTable, labeledSpendPublicKey } from './labels.js';
import { publicKeyOf } from './keys.js';
import { BITCOIN_MAINNET } from './params.js';
import {
  computeTransactionTweak,
  receiverEcdhSharedSecret,
  scanOutputsForTweak,
  scanTransaction,
  spendPrivateKey,
} from './receiver.js';
import {
  buildSenderContext,
  createSilentPaymentOutputs,
  senderEcdhSharedSecret,
  type SenderKey,
} from './sender.js';
import { secretScalarFromBytes, unsafeRevealSecret } from './secret.js';
import { taprootScriptPubKey, txInputFromHex, type TxInput } from './tx.js';
import { loadSendReceiveVectors, type VinJson } from './vectors.testutil.js';

const cases = loadSendReceiveVectors();

function inputsOf(vin: readonly VinJson[]): TxInput[] {
  return vin.map((v) =>
    txInputFromHex({
      txid: v.txid,
      vout: v.vout,
      scriptSig: v.scriptSig,
      txinwitness: v.txinwitness,
      prevoutScriptPubKey: v.prevout.scriptPubKey.hex,
    }),
  );
}

const tally = { cases: 0, sending: 0, receiving: 0 };

describe('BIP-352 official send_and_receive_test_vectors.json', () => {
  it('has the expected shape', () => {
    expect(cases).toHaveLength(28);
    expect(cases.reduce((n, c) => n + c.sending.length, 0)).toBe(28);
    expect(cases.reduce((n, c) => n + c.receiving.length, 0)).toBe(29);
  });

  for (const c of cases) {
    describe(c.comment, () => {
      it('sending', () => {
        tally.cases++;
        for (const s of c.sending) {
          tally.sending++;
          const inputs = inputsOf(s.given.vin);
          const keys: SenderKey[] = [];
          const pubs: string[] = [];
          s.given.vin.forEach((v, i) => {
            const eligible = extractInputPublicKey(BITCOIN_MAINNET, inputs[i] as TxInput);
            if (eligible === null) return;
            pubs.push(toHex(eligible.publicKey));
            keys.push({
              privateKey: secretScalarFromBytes(hexToBytes(v.private_key as string)),
              type: eligible.type,
            });
          });
          expect(pubs).toEqual(s.expected.input_pub_keys);

          const addresses: string[] = [];
          for (const r of s.given.recipients)
            for (let n = 0; n < (r.count ?? 1); n++) addresses.push(r.address);
          for (const r of s.given.recipients) {
            const d = decodeAddress(BITCOIN_MAINNET, r.address);
            expect(toHex(d.scanPublicKey)).toBe(r.scan_pub_key);
            expect(toHex(d.spendPublicKey)).toBe(r.spend_pub_key);
          }
          const params = {
            chain: BITCOIN_MAINNET,
            inputs: keys,
            outpoints: inputs.map((i) => ({ txid: i.txid, vout: i.vout })),
            recipients: addresses,
          };

          const expectedSets = s.expected.outputs.map((o) => [...o].sort());
          if (expectedSets.length === 1 && expectedSets[0]?.length === 0) {
            // Sender must produce nothing: no eligible input, key sum zero, or K_max exceeded.
            expect(() => createSilentPaymentOutputs(params)).toThrow(BtcFamilyError);
            return;
          }
          const ctx = buildSenderContext(BITCOIN_MAINNET, keys, params.outpoints);
          if (s.expected.input_private_key_sum !== undefined) {
            expect(toHex(unsafeRevealSecret(ctx.inputPrivateKeySum))).toBe(s.expected.input_private_key_sum);
          }
          const seenScan = new Set<string>();
          addresses.forEach((a, idx) => {
            const scan = decodeAddress(BITCOIN_MAINNET, a).scanPublicKey;
            if (seenScan.has(toHex(scan))) return;
            seenScan.add(toHex(scan));
            expect(toHex(senderEcdhSharedSecret(ctx, scan))).toBe(s.expected.shared_secrets[idx]);
          });
          const out = createSilentPaymentOutputs(params).map((o) => toHex(o.xOnlyPublicKey));
          expect(out).toHaveLength(addresses.length);
          expect(expectedSets).toContainEqual([...out].sort());
        }
      });

      it('receiving', () => {
        for (const r of c.receiving) {
          tally.receiving++;
          const scanSecret = secretScalarFromBytes(hexToBytes(r.given.key_material.scan_priv_key));
          const spendSecret = secretScalarFromBytes(hexToBytes(r.given.key_material.spend_priv_key));
          const scanPub = publicKeyOf(scanSecret);
          const spendPub = publicKeyOf(spendSecret);

          const addresses = [encodeAddress(BITCOIN_MAINNET, scanPub, spendPub)];
          for (const m of r.given.labels) {
            addresses.push(
              encodeAddress(BITCOIN_MAINNET, scanPub, labeledSpendPublicKey(spendPub, scanSecret, m)),
            );
          }
          expect(addresses).toEqual(r.expected.addresses);

          const inputs = inputsOf(r.given.vin);
          const tw = computeTransactionTweak(BITCOIN_MAINNET, inputs);
          if (tw === null) {
            expect(r.expected.outputs ?? []).toEqual([]);
            expect(r.expected.tweak).toBeNull();
            expect(
              scanTransaction(BITCOIN_MAINNET, { scanSecret, spendPublicKey: spendPub }, inputs, []),
            ).toEqual([]);
            continue;
          }
          expect(toHex(tw.inputPublicKeySum)).toBe(r.expected.input_pub_key_sum);
          expect(toHex(tw.tweak)).toBe(r.expected.tweak);
          expect(toHex(receiverEcdhSharedSecret(scanSecret, tw.tweak))).toBe(r.expected.shared_secret);

          const keys = {
            scanSecret,
            spendPublicKey: spendPub,
            labels: createLabelTable(scanSecret, r.given.labels),
          };
          const outputs = r.given.outputs.map((o) => hexToBytes(o));
          const found = scanOutputsForTweak(keys, tw.tweak, outputs);
          // Same result through the raw-transaction path (outputs as P2TR scripts).
          const viaTx = scanTransaction(BITCOIN_MAINNET, keys, inputs, outputs.map(taprootScriptPubKey));
          expect(viaTx.map((f) => toHex(f.xOnlyPublicKey))).toEqual(
            found.map((f) => toHex(f.xOnlyPublicKey)),
          );

          if (r.expected.n_outputs !== undefined) {
            expect(found).toHaveLength(r.expected.n_outputs);
            continue;
          }
          const msg = sha256(new TextEncoder().encode('message'));
          const aux = sha256(new TextEncoder().encode('random auxiliary data'));
          const got = found.map((f) => {
            const sk = spendPrivateKey(spendSecret, f.spendTweak);
            expect(toHex(sk.xOnlyPublicKey)).toBe(toHex(f.xOnlyPublicKey));
            const sig = schnorr.sign(msg, sk.privateKey, aux);
            expect(schnorr.verify(sig, msg, sk.xOnlyPublicKey)).toBe(true);
            return {
              priv_key_tweak: toHex(unsafeRevealSecret(f.spendTweak)),
              pub_key: toHex(f.xOnlyPublicKey),
              signature: toHex(sig),
            };
          });
          const byKey = (a: { pub_key: string }, b: { pub_key: string }): number =>
            a.pub_key.localeCompare(b.pub_key);
          // The vectors define a SET of outputs; order is not significant.
          expect([...got].sort(byKey)).toEqual([...(r.expected.outputs ?? [])].sort(byKey));
        }
      });
    });
  }

  it('ran every vector (exact counts)', () => {
    expect(tally).toEqual({ cases: 28, sending: 28, receiving: 29 });
  });
});
