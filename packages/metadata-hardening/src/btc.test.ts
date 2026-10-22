import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  SEQUENCE_RBF, assertLocktimeEffective, assertUniformSequences, chooseLocktime, chooseSequence, normalizeFeeRate,
  orderInputs, orderOutputs, planChange, stripPsbtFingerprints,
} from './btc.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

// BIP-69 example tx 0a6a357e...c4c3 (retrieved 2026-10-21, bips/bip-0069.mediawiki).
const BIP69_INPUTS = [
  ['0e53ec5dfb2cb8a71fec32dc9a634a35b7e24799295ddd5278217822e0b31f57', 0],
  ['26aa6e6d8b9e49bb0630aac301db6757c02e3619feb4ee0eea81eb1672947024', 1],
  ['28e0fdd185542f2c6ea19030b0796051e7772b6026dd5ddccd7a2f93b73e6fc2', 0],
  ['381de9b9ae1a94d9c17f6a08ef9d341a5ce29e2e60c36a52d333ff6203e58d5d', 1],
  ['3b8b2f8efceb60ba78ca8bba206a137f14cb5ea4035e761ee204302d46b98de2', 0],
  ['402b2c02411720bf409eff60d05adad684f135838962823f3614cc657dd7bc0a', 1],
  ['54ffff182965ed0957dba1239c27164ace5a73c9b62a660c74b7b7f15ff61e7a', 1],
  ['643e5f4e66373a57251fb173151e838ccd27d279aca882997e005016bb53d5aa', 0],
  ['6c1d56f31b2de4bfc6aaea28396b333102b1f600da9c6d6149e96ca43f1102b1', 1],
  ['7a1de137cbafb5c70405455c49c5104ca3057a1f1243e6563bb9245c9c88c191', 0],
  ['7d037ceb2ee0dc03e82f17be7935d238b35d1deabf953a892a4507bfbeeb3ba4', 1],
  ['a5e899dddb28776ea9ddac0a502316d53a4a3fca607c72f66c470e0412e34086', 0],
  ['b4112b8f900a7ca0c8b0e7c4dfad35c6be5f6be46b3458974988e1cdb2fa61b8', 0],
  ['bafd65e3c7f3f9fdfdc1ddb026131b278c3be1af90a4a6ffa78c4658f9ec0c85', 0],
  ['de0411a1e97484a2804ff1dbde260ac19de841bebad1880c782941aca883b4e9', 1],
  ['f0a130a84912d03c1d284974f563c5949ac13f8342b8112edff52971599e6a45', 0],
  ['f320832a9d2e2452af63154bc687493484a0e7745ebd3aaf9ca19eb80834ad60', 0],
].map(([txid, vout]) => ({ txid: txid as string, vout: vout as number }));
const OUT_A = { amountSats: 400057456n, scriptPubKey: '76a9144a5fba237213a062f6f57978f796390bdcf8d01588ac' };
const OUT_B = { amountSats: 40000000000n, scriptPubKey: '76a9145be32612930b8323add2212a4ec03c1562084f8488ac' };
const OUT_C = { amountSats: 100000000n, scriptPubKey: '41046a0765b5865641ce08dd39690aade26dfbf5511430ca428a3089261361cef170e3929a68aee3d8d4848b0c5111b0a37b82b86ad559fd2a745b44d8e8d9dfdc0cac' };
const OUT_D = { amountSats: 2400000000n, scriptPubKey: '41044a656f065871a353f216ca26cef8dde2f03e8c16202d2e8ad769f02032cb86a5eb5e56842e92e19141d60a01928f8dd2c875a390f67c1f6c94cfc617c0ea45afac' };
const N = 'regtest';

describe('MH-BTC-5 ordering', () => {
  it('BIP-69 vector: shuffled inputs sort back to the published order', () => {
    const rng = seededRng(21);
    for (let i = 0; i < 20; i++) {
      const scrambled = orderInputs(N, BIP69_INPUTS, 'shuffle', rng).items;
      expect(orderInputs(N, scrambled, 'bip69').items).toEqual(BIP69_INPUTS);
    }
  });
  it('BIP-69 vector: outputs by amount then script', () => {
    expect(orderOutputs(N, [OUT_B, OUT_A], 'bip69').items).toEqual([OUT_A, OUT_B]);
    expect(orderOutputs(N, [OUT_D, OUT_C], 'bip69').items).toEqual([OUT_C, OUT_D]);
  });
  it('ties: same txid orders by vout; same amount by script bytes; stable for equal', () => {
    const t = 'ab'.repeat(32);
    expect(orderInputs(N, [{ txid: t, vout: 2 }, { txid: t, vout: 1 }], 'bip69').items.map((i) => i.vout)).toEqual([1, 2]);
    const s1 = { amountSats: 5n, scriptPubKey: '0014aa' };
    const s2 = { amountSats: 5n, scriptPubKey: '0014ab' };
    expect(orderOutputs(N, [s2, s1], 'bip69').items).toEqual([s1, s2]);
    const dup = orderOutputs(N, [{ ...s1, tag: 1 }, { ...s1, tag: 2 }], 'bip69');
    expect(dup.items.map((x) => x.tag)).toEqual([1, 2]);
  });
  it('order permutation maps back to originals', () => {
    const outs = [OUT_B, OUT_A];
    const r = orderOutputs(N, outs, 'bip69');
    expect(r.order).toEqual([1, 0]);
    expect(r.order.map((i) => outs[i])).toEqual(r.items);
  });
  it('none keeps caller order; shuffle is a permutation and covers all orders', () => {
    expect(orderOutputs(N, [OUT_B, OUT_A], 'none').items).toEqual([OUT_B, OUT_A]);
    const seen = new Set<string>();
    const rng = seededRng(6);
    for (let i = 0; i < 100; i++) {
      const r = orderOutputs(N, [OUT_A, OUT_B, OUT_C], 'shuffle', rng);
      expect([...r.order].sort()).toEqual([0, 1, 2]);
      seen.add(r.order.join(''));
    }
    expect(seen.size).toBe(6);
  });
  it('rejects malformed items and mainnet-like network', () => {
    expect(() => orderInputs(N, [{ txid: 'zz', vout: 0 }], 'bip69')).toThrow(MetadataHardeningError);
    expect(() => orderInputs(N, [{ txid: 'ab'.repeat(32), vout: -1 }], 'bip69')).toThrow(MetadataHardeningError);
    expect(() => orderOutputs(N, [{ amountSats: -1n, scriptPubKey: '' }], 'bip69')).toThrow(MetadataHardeningError);
    expect(() => orderOutputs(N, [{ amountSats: 1n, scriptPubKey: 'abc' }], 'bip69')).toThrow(MetadataHardeningError);
    expect(() => orderOutputs('mainnet', [], 'bip69')).toThrowError(/testnet/);
    expect(() => orderInputs('bitcoin', [], 'none')).toThrow(MetadataHardeningError);
  });
});

describe('MH-BTC-1 change', () => {
  const base = { network: 'signet', inputTotalSats: 100_000n, amountSats: 60_000n, feeSats: 1_000n };
  it('requires a change address above dust and returns exact change', () => {
    expect(() => planChange(base)).toThrowError(/change address required/);
    expect(planChange({ ...base, changeAddress: 'tb1qchange', inputAddresses: ['tb1qin'] })).toEqual({ changeSats: 39_000n, hasChange: true, dustToFeeSats: 0n });
  });
  it('folds sub-dust left-over into the fee, no address needed', () => {
    expect(planChange({ ...base, amountSats: 98_500n })).toEqual({ changeSats: 0n, hasChange: false, dustToFeeSats: 500n });
    expect(planChange({ ...base, amountSats: 99_000n })).toEqual({ changeSats: 0n, hasChange: false, dustToFeeSats: 0n });
    expect(planChange({ ...base, amountSats: 98_454n })).toMatchObject({ hasChange: false, dustToFeeSats: 546n });
    expect(planChange({ ...base, amountSats: 98_453n, changeAddress: 'tb1qc' })).toMatchObject({ hasChange: true, changeSats: 547n });
  });
  it('rejects input-address reuse, underfunded, bad amounts', () => {
    expect(() => planChange({ ...base, changeAddress: 'tb1qin', inputAddresses: ['tb1qin'] })).toThrowError(/reuse/);
    expect(() => planChange({ ...base, amountSats: 99_500n })).toThrowError(/cover/);
    expect(() => planChange({ ...base, amountSats: 0n })).toThrow(MetadataHardeningError);
    expect(() => planChange({ ...base, changeAddress: '' })).toThrow(MetadataHardeningError);
    expect(() => planChange({ ...base, network: 'bitcoin' })).toThrow(MetadataHardeningError);
  });
});

describe('MH-BTC-2 fee rate', () => {
  it('known values', () => {
    expect(normalizeFeeRate(N, 1.3)).toBe(2);
    expect(normalizeFeeRate(N, 2)).toBe(2);
    expect(normalizeFeeRate(N, 7.01, { step: 5 })).toBe(10);
    expect(normalizeFeeRate(N, 0.3, { step: 0.1, minRate: 0.2 })).toBeGreaterThanOrEqual(0.3);
    expect(normalizeFeeRate(N, 0.4, { minRate: 1 })).toBe(1);
    expect(normalizeFeeRate(N, 0.4, { step: 5, minRate: 3 })).toBe(5);
  });
  it('1000 random inputs: >= input, < input+step, on grid, <= cap', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 500, noNaN: true }), fc.constantFrom(1, 2, 5, 10), (r, step) => {
        const out = normalizeFeeRate(N, r, { step });
        return out >= r && out < r + step + 1e-9 && Math.abs(out / step - Math.round(out / step)) < 1e-9;
      }),
      { numRuns: 1000 },
    );
  });
  it('cap: clamps to cap when only rounding exceeds it; rejects when the input itself does', () => {
    expect(normalizeFeeRate(N, 9.5, { step: 5, cap: 10 })).toBe(10);
    expect(normalizeFeeRate(N, 6, { step: 5, cap: 8 })).toBe(8);
    expect(() => normalizeFeeRate(N, 12, { cap: 10 })).toThrow(MetadataHardeningError);
  });
  it('validates', () => {
    for (const r of [0, -1, NaN, Infinity]) expect(() => normalizeFeeRate(N, r)).toThrow(MetadataHardeningError);
    expect(() => normalizeFeeRate(N, 1, { step: 0 })).toThrow(MetadataHardeningError);
    expect(() => normalizeFeeRate('mainnet', 1)).toThrow(MetadataHardeningError);
  });
});

describe('MH-BTC-3/4 locktime and sequence', () => {
  it('locktime', () => {
    expect(chooseLocktime(N, 'zero')).toBe(0);
    expect(chooseLocktime(N, 'height', 123_456)).toBe(123_456);
    expect(() => chooseLocktime(N, 'height')).toThrow(MetadataHardeningError);
    expect(() => chooseLocktime(N, 'height', 500_000_000)).toThrow(MetadataHardeningError);
    expect(() => chooseLocktime(N, 'height', -1)).toThrow(MetadataHardeningError);
  });
  it('locktime needs a non-final sequence', () => {
    expect(() => assertLocktimeEffective(100, [0xffffffff, 0xffffffff])).toThrow(MetadataHardeningError);
    expect(() => assertLocktimeEffective(100, [0xffffffff, SEQUENCE_RBF])).not.toThrow();
    expect(() => assertLocktimeEffective(0, [0xffffffff])).not.toThrow();
  });
  it('RBF on by default; off needs an acknowledgement and warns', () => {
    expect(chooseSequence(N)).toEqual({ sequence: 0xfffffffd });
    expect(chooseSequence(N, { rbf: true }).sequence).toBeLessThan(0xfffffffe);
    expect(() => chooseSequence(N, { rbf: false })).toThrow(MetadataHardeningError);
    const off = chooseSequence(N, { rbf: false, acknowledgeUnusual: true });
    expect(off.sequence).toBe(0xfffffffe);
    expect(off.warning).toMatch(/unusual/);
    expect(() => chooseSequence('bitcoin')).toThrow(MetadataHardeningError);
  });
  it('uniform sequences', () => {
    expect(() => assertUniformSequences([1, 1, 1])).not.toThrow();
    expect(() => assertUniformSequences([])).not.toThrow();
    expect(() => assertUniformSequences([0xfffffffd, 0xfffffffe])).toThrow(MetadataHardeningError);
  });
});

describe('MH-BTC-6 PSBT strip', () => {
  const rec = (keyType: number) => ({ keyType, key: '', value: '00' });
  it('drops xpubs, bip32 paths, tap bip32, proprietary and unknown records; keeps the rest', () => {
    const { psbt, removed } = stripPsbtFingerprints('testnet', {
      global: [rec(0x00), rec(0x01), rec(0xfb), rec(0xfc), rec(0x77)],
      inputs: [[rec(0x01), rec(0x06), rec(0x16), rec(0x17), rec(0xfc)], [rec(0x02), rec(0x06)]],
      outputs: [[rec(0x03), rec(0x04), rec(0x02), rec(0x07), rec(0xfc)]],
    });
    expect(psbt.global.map((r) => r.keyType)).toEqual([0x00, 0xfb]);
    expect(psbt.inputs.map((a) => a.map((r) => r.keyType))).toEqual([[0x01, 0x17], [0x02]]);
    expect(psbt.outputs.map((a) => a.map((r) => r.keyType))).toEqual([[0x03, 0x04]]);
    expect(removed).toBe(3 + 3 + 1 + 3);
  });
  it('empty psbt and bad network', () => {
    expect(stripPsbtFingerprints('signet', { global: [], inputs: [], outputs: [] }).removed).toBe(0);
    expect(() => stripPsbtFingerprints('mainnet', { global: [], inputs: [], outputs: [] })).toThrow(MetadataHardeningError);
  });
});
