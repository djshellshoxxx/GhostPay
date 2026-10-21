import { bytesToNumberBE } from '@noble/curves/utils.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { concatBytes } from '@noble/hashes/utils.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { K_MAX, mulG, scalarBytes, toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys } from './keys.js';
import { changeAddress, createLabelTable, labeledAddress, silentPaymentAddress } from './labels.js';
import {
  scanTransaction,
  spendPrivateKey,
  scanOutputsForTweak,
  computeTransactionTweak,
} from './receiver.js';
import { createSilentPaymentOutputs, buildSenderContext, type SenderKey } from './sender.js';
import { seededRng } from './rng.testutil.js';
import { CURVE_ORDER, secretScalarFromBytes, unsafeRevealSecret, zeroize } from './secret.js';
import {
  hash160,
  p2pkhInput,
  p2shP2wpkhInput,
  p2trInput,
  p2wpkhInput,
  type TestInput,
} from './fixtures.testutil.js';
import { taprootScriptPubKey } from './tx.js';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

const MSG = new Uint8Array(32).fill(9);

function pay(
  inputs: readonly TestInput[],
  recipients: string[],
): { scripts: Uint8Array[]; xs: Uint8Array[] } {
  const out = createSilentPaymentOutputs({
    inputs: inputs.map((i) => i.key),
    outpoints: inputs.map((i) => ({ txid: i.input.txid, vout: i.input.vout })),
    recipients,
    network: 'mainnet',
  });
  const xs = out.map((o) => o.xOnlyPublicKey);
  return { xs, scripts: xs.map(taprootScriptPubKey) };
}

describe('sender -> receiver round trip', () => {
  const alice = generateSilentPaymentKeys(seededRng('alice'));
  const bob = generateSilentPaymentKeys(seededRng('bob'));
  const aliceAddr = silentPaymentAddress(alice, 'mainnet');

  it('every eligible input type works, alone and mixed, and the spend key signs', () => {
    const sets: TestInput[][] = [
      [p2wpkhInput('1')],
      [p2shP2wpkhInput('2')],
      [p2pkhInput('3')],
      [p2trInput('4')],
      [p2trInput('5'), p2trInput('6'), p2wpkhInput('7'), p2pkhInput('8'), p2shP2wpkhInput('9')],
    ];
    for (const inputs of sets) {
      const { scripts } = pay(inputs, [aliceAddr]);
      const found = scanTransaction(
        { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey },
        inputs.map((i) => i.input),
        scripts,
      );
      expect(found).toHaveLength(1);
      const sk = spendPrivateKey(alice.spendSecret, found[0]!.spendTweak);
      expect(toHex(sk.xOnlyPublicKey)).toBe(toHex(found[0]!.xOnlyPublicKey));
      expect(schnorr.verify(schnorr.sign(MSG, sk.privateKey), MSG, sk.xOnlyPublicKey)).toBe(true);
    }
  });

  it('somebody else cannot find the payment', () => {
    const inputs = [p2wpkhInput('only-alice')];
    const { scripts } = pay(inputs, [aliceAddr]);
    const found = scanTransaction(
      { scanSecret: bob.scanSecret, spendPublicKey: bob.spendPublicKey },
      inputs.map((i) => i.input),
      scripts,
    );
    expect(found).toEqual([]);
    // right scan key, wrong spend key: no match either
    const mixed = scanTransaction(
      { scanSecret: alice.scanSecret, spendPublicKey: bob.spendPublicKey },
      inputs.map((i) => i.input),
      scripts,
    );
    expect(mixed).toEqual([]);
  });

  it('labeled and change addresses are found with the right label; unknown labels are invisible', () => {
    const inputs = [p2wpkhInput('lab')];
    const l5 = labeledAddress(alice, 'mainnet', 5);
    const l9 = labeledAddress(alice, 'mainnet', 9);
    const change = changeAddress(alice, 'mainnet');
    const { scripts } = pay(inputs, [l5, change, aliceAddr, l9, l5]);
    const base = { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey };
    const txIn = inputs.map((i) => i.input);

    const withLabels = scanTransaction(
      { ...base, labels: createLabelTable(alice.scanSecret, [5, 9]) },
      txIn,
      scripts,
    );
    expect(withLabels.map((f) => [f.k, f.label])).toEqual([
      [0, 5],
      [1, 0],
      [2, null],
      [3, 9],
      [4, 5],
    ]);
    for (const f of withLabels) {
      const sk = spendPrivateKey(alice.spendSecret, f.spendTweak);
      expect(toHex(sk.xOnlyPublicKey)).toBe(toHex(f.xOnlyPublicKey));
      expect(schnorr.verify(schnorr.sign(MSG, sk.privateKey), MSG, sk.xOnlyPublicKey)).toBe(true);
    }
    // Without label 5 and 9 the scan still finds the change label and unlabeled outputs only up to the first miss.
    const noLabels = scanTransaction(base, txIn, scripts);
    expect(noLabels).toEqual([]); // k = 0 is label 5, unknown -> scanning stops (documented BIP behaviour)
    const onlyPlain = pay(inputs, [aliceAddr, change]);
    const plain = scanTransaction(base, txIn, onlyPlain.scripts);
    expect(plain.map((f) => f.label)).toEqual([null, 0]);
  });

  it('keeps scanning after matches the wallet might not care about (k++ on every cryptographic match)', () => {
    const inputs = [p2wpkhInput('many')];
    const { scripts } = pay(inputs, Array<string>(20).fill(aliceAddr));
    const found = scanTransaction(
      { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey },
      inputs.map((i) => i.input),
      scripts,
    );
    expect(found.map((f) => f.k)).toEqual([...Array(20).keys()]);
  });

  it('ignores non-taproot outputs and unrelated outputs', () => {
    const inputs = [p2wpkhInput('noise')];
    const { scripts } = pay(inputs, [aliceAddr]);
    const noise = [Uint8Array.of(0x6a), new Uint8Array(22), taprootScriptPubKey(new Uint8Array(32).fill(3))];
    const found = scanTransaction(
      { scanSecret: alice.scanSecret, spendPublicKey: alice.spendPublicKey },
      inputs.map((i) => i.input),
      [...noise, ...scripts],
    );
    expect(found).toHaveLength(1);
  });

  it('property: random keys, labels and input mixes always round-trip (both y parities)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 0xffffffff }),
        fc.array(fc.constantFrom('w', 's', 'p', 't'), { minLength: 1, maxLength: 4 }),
        (seed, label, kinds) => {
          const recv = generateSilentPaymentKeys(seededRng(`prop:${seed}`));
          const mk = { w: p2wpkhInput, s: p2shP2wpkhInput, p: p2pkhInput, t: p2trInput } as const;
          const inputs = kinds.map((kind, i) => mk[kind](`${seed}:${i}`, i));
          const addr = labeledAddress(recv, 'mainnet', label);
          const { scripts } = pay(inputs, [addr, silentPaymentAddress(recv, 'mainnet')]);
          const found = scanTransaction(
            {
              scanSecret: recv.scanSecret,
              spendPublicKey: recv.spendPublicKey,
              labels: createLabelTable(recv.scanSecret, [label]),
            },
            inputs.map((i) => i.input),
            scripts,
          );
          expect(found.map((f) => f.label)).toEqual([label, null]);
          for (const f of found) {
            const sk = spendPrivateKey(recv.spendSecret, f.spendTweak);
            expect(toHex(sk.xOnlyPublicKey)).toBe(toHex(f.xOnlyPublicKey));
            expect(schnorr.verify(schnorr.sign(MSG, sk.privateKey), MSG, sk.xOnlyPublicKey)).toBe(true);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('sender failure modes', () => {
  const r = generateSilentPaymentKeys(seededRng('r'));
  const addr = silentPaymentAddress(r, 'mainnet');
  const inp = p2wpkhInput('f');
  const base = {
    inputs: [inp.key],
    outpoints: [{ txid: inp.input.txid, vout: inp.input.vout }],
    recipients: [addr],
    network: 'mainnet' as const,
  };

  it('fails closed without keys, without outpoints, on bad addresses and on network mismatch', () => {
    expect(codeOf(() => createSilentPaymentOutputs({ ...base, inputs: [] }))).toBe('NO_ELIGIBLE_INPUTS');
    expect(codeOf(() => createSilentPaymentOutputs({ ...base, outpoints: [] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => createSilentPaymentOutputs({ ...base, recipients: ['sp1qnope'] }))).toBe(
      'INVALID_ADDRESS',
    );
    expect(codeOf(() => createSilentPaymentOutputs({ ...base, network: 'testnet' }))).toBe(
      'NETWORK_MISMATCH',
    );
    expect(
      codeOf(() => createSilentPaymentOutputs({ ...base, recipients: [silentPaymentAddress(r, 'testnet')] })),
    ).toBe('NETWORK_MISMATCH');
    expect(createSilentPaymentOutputs({ ...base, recipients: [] })).toEqual([]);
  });

  it('input keys summing to zero fail, but an intermediate zero is fine', () => {
    const d = bytesToNumberBE(inp.key.privateKey);
    const neg = secretScalarFromBytes(scalarBytes(CURVE_ORDER - d));
    expect(
      codeOf(() => buildSenderContext([inp.key, { privateKey: neg, isTaproot: false }], base.outpoints)),
    ).toBe('INPUT_SUM_ZERO');
    const third = p2wpkhInput('third').key;
    expect(() =>
      buildSenderContext([inp.key, { privateKey: neg, isTaproot: false }, third], base.outpoints),
    ).not.toThrow();
  });

  it('taproot parity: odd-y keys are negated, so both key and negated key give the same outputs', () => {
    const t = p2trInput('par');
    const d = bytesToNumberBE(t.key.privateKey);
    const flipped: SenderKey = {
      privateKey: secretScalarFromBytes(scalarBytes(CURVE_ORDER - d)),
      isTaproot: true,
    };
    const a = createSilentPaymentOutputs({
      ...base,
      inputs: [t.key],
      outpoints: [{ txid: t.input.txid, vout: 0 }],
    });
    const b = createSilentPaymentOutputs({
      ...base,
      inputs: [flipped],
      outpoints: [{ txid: t.input.txid, vout: 0 }],
    });
    expect(toHex(a[0]!.xOnlyPublicKey)).toBe(toHex(b[0]!.xOnlyPublicKey));
    // a non-taproot key is NOT normalized
    const c = createSilentPaymentOutputs({
      ...base,
      inputs: [{ ...t.key, isTaproot: false }],
      outpoints: [{ txid: t.input.txid, vout: 0 }],
    });
    const e = createSilentPaymentOutputs({
      ...base,
      inputs: [{ ...flipped, isTaproot: false }],
      outpoints: [{ txid: t.input.txid, vout: 0 }],
    });
    expect(toHex(c[0]!.xOnlyPublicKey)).not.toBe(toHex(e[0]!.xOnlyPublicKey));
  });

  it('enforces K_max = 2323 recipients per scan key', () => {
    expect(K_MAX).toBe(2323);
    expect(
      codeOf(() => createSilentPaymentOutputs({ ...base, recipients: Array<string>(K_MAX + 1).fill(addr) })),
    ).toBe('GROUP_LIMIT_EXCEEDED');
    expect(createSilentPaymentOutputs({ ...base, recipients: Array<string>(K_MAX).fill(addr) })).toHaveLength(
      K_MAX,
    );
  });

  it('outputs for two different scan keys use independent counters', () => {
    const other = generateSilentPaymentKeys(seededRng('r2'));
    const out = createSilentPaymentOutputs({
      ...base,
      recipients: [addr, silentPaymentAddress(other, 'mainnet'), addr],
    });
    expect(out.map((o) => o.k)).toEqual([0, 0, 1]);
    expect(out.map((o) => o.recipientIndex)).toEqual([0, 1, 2]);
  });

  it('zeroizes the transient sum of input keys after use', () => {
    const ctx = buildSenderContext([inp.key], base.outpoints);
    const copy = unsafeRevealSecret(ctx.inputPrivateKeySum);
    expect(copy.some((b) => b !== 0)).toBe(true);
    zeroize(ctx.inputPrivateKeySum, ctx.inputHash);
    expect(ctx.inputPrivateKeySum.every((b) => b === 0)).toBe(true);
  });
});

describe('receiver edge cases', () => {
  const r = generateSilentPaymentKeys(seededRng('re'));
  it('rejects malformed x-only candidates and invalid tweak points', () => {
    const keys = { scanSecret: r.scanSecret, spendPublicKey: r.spendPublicKey };
    expect(codeOf(() => scanOutputsForTweak(keys, mulG(3n).toBytes(true), [new Uint8Array(31)]))).toBe(
      'INVALID_INPUT',
    );
    expect(codeOf(() => scanOutputsForTweak(keys, new Uint8Array(33), []))).toBe('INVALID_POINT');
    expect(scanOutputsForTweak(keys, mulG(3n).toBytes(true), [])).toEqual([]);
  });

  it('tx with eligible inputs whose key sum is infinity is skipped', () => {
    const a = p2wpkhInput('inf');
    const d = bytesToNumberBE(a.key.privateKey);
    const neg = secretScalarFromBytes(scalarBytes(CURVE_ORDER - d));
    const pub = mulG(CURVE_ORDER - d).toBytes(true);
    const b: TestInput = {
      ...a,
      input: {
        ...a.input,
        txid: p2wpkhInput('inf2').input.txid,
        witness: [new Uint8Array(71), pub],
        prevoutScriptPubKey: p2wpkhInputSpk(pub),
      },
      key: { privateKey: neg, isTaproot: false },
    };
    expect(computeTransactionTweak([a.input, b.input])).toBeNull();
  });

  it('K_max also bounds the receiver scan', () => {
    const a = p2wpkhInput('kmax');
    const { xs } = pay([a], Array<string>(K_MAX).fill(silentPaymentAddress(r, 'mainnet')));
    const tw = computeTransactionTweak([a.input]);
    const found = scanOutputsForTweak(
      { scanSecret: r.scanSecret, spendPublicKey: r.spendPublicKey },
      tw!.tweak,
      xs,
    );
    expect(found).toHaveLength(K_MAX);
  });
});
function p2wpkhInputSpk(pub: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(0, 0x14), hash160(pub));
}
