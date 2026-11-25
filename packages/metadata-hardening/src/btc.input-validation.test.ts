import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertLocktimeEffective,
  assertUniformSequences,
  chooseLocktime,
  chooseSequence,
  normalizeFeeRate,
  orderInputs,
  orderOutputs,
  planChange,
  stripPsbtFingerprints,
  type PlainPsbt,
} from './btc.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const NET = 'regtest';
const TXID = 'ab'.repeat(32);
const BECH32 = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH-BTC-1 planChange: runtime types and address reuse', () => {
  const ok = { network: NET, inputTotalSats: 100_000n, amountSats: 1000n, feeSats: 100n, changeAddress: 'bcrt1qchange0000000000000000000000000000000' };
  it('needs bigint amounts and an options object (regression: number inputs leaked a TypeError)', () => {
    for (const v of [100, '100', null, undefined, 1.5, {}]) {
      for (const f of ['inputTotalSats', 'amountSats', 'feeSats', 'dustSats'] as const) {
        if (f === 'dustSats' && v === undefined) continue; // optional: undefined means "default"
        expect(codeOf(() => planChange({ ...ok, [f]: v })), `${f}=${typeof v}`).toBe('INVALID_INPUT');
      }
    }
    for (const o of [undefined, null, 5, 'x', []]) expect(codeOf(() => planChange(o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange({ ...ok, network: 'mainnet' }))).toBe('UNSUPPORTED_NETWORK');
    expect(codeOf(() => planChange({ ...ok, changeAddress: 5 as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange({ ...ok, inputAddresses: 'x' as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange({ ...ok, inputAddresses: [5 as never] }))).toBe('INVALID_INPUT');
  });
  it('catches change-address reuse across bech32 case (regression: an uppercase QR form bypassed the check)', () => {
    const reuse = { ...ok, changeAddress: BECH32.toUpperCase(), inputAddresses: [BECH32] };
    expect(codeOf(() => planChange(reuse))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange({ ...reuse, changeAddress: BECH32, inputAddresses: [BECH32.toUpperCase()] }))).toBe('INVALID_INPUT');
    // base58 is case-sensitive: two different strings are two different addresses.
    expect(codeOf(() => planChange({ ...ok, changeAddress: 'mkHS9ne12qx9pS9VojpwU5xtRd4T7X7ZUt', inputAddresses: ['mkhs9ne12qx9ps9vojpwu5xtrd4t7x7zut'] }))).toBe('NO_THROW');
    expect(codeOf(() => planChange({ ...ok, changeAddress: 'mkHS9ne12qx9pS9VojpwU5xtRd4T7X7ZUt', inputAddresses: ['mkHS9ne12qx9pS9VojpwU5xtRd4T7X7ZUt'] }))).toBe('INVALID_INPUT');
  });
  it('conserves value: change + fee + amount = inputs, or the remainder is folded into the fee', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 6n }), fc.bigInt({ min: 0n, max: 10n ** 12n }), (amount, fee, extra) => {
        const total = amount + fee + extra;
        const plan = planChange({ ...ok, inputTotalSats: total, amountSats: amount, feeSats: fee });
        expect(plan.changeSats + plan.dustToFeeSats + amount + fee).toBe(total);
        expect(plan.hasChange).toBe(extra > 546n);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('MH-BTC-2/3/4 helpers: runtime types', () => {
  it('normalizeFeeRate needs finite numbers and an options object', () => {
    for (const r of ['5', null, undefined, NaN, Infinity, 0, -1, 5n]) expect(codeOf(() => normalizeFeeRate(NET, r as never))).toBe('INVALID_INPUT');
    for (const o of [null, 5, 'x', []]) expect(codeOf(() => normalizeFeeRate(NET, 5, o as never))).toBe('INVALID_INPUT');
    expect(normalizeFeeRate(NET, 2.2, { step: 0.5 })).toBe(2.5);
  });
  it('fee normalisation never undershoots the input and never exceeds a cap (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1e6, noNaN: true }), fc.double({ min: 0.001, max: 100, noNaN: true }), (rate, step) => {
        const r = normalizeFeeRate(NET, rate, { step, minRate: 0.001 });
        expect(r).toBeGreaterThanOrEqual(rate);
        expect(r - rate).toBeLessThanOrEqual(step * (1 + 1e-9));
        if (rate < 1e6) expect(normalizeFeeRate(NET, rate, { step, minRate: 0.001, cap: r })).toBeLessThanOrEqual(r);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
  it('chooseLocktime and chooseSequence reject loose truthiness', () => {
    expect(codeOf(() => chooseLocktime(NET, 'height'))).toBe('INVALID_INPUT');
    for (const h of ['5', 5.5, -1, 500_000_000, null, NaN]) expect(codeOf(() => chooseLocktime(NET, 'height', h as never))).toBe('INVALID_INPUT');
    for (const m of ['Height', '', null, undefined, 1, {}]) expect(codeOf(() => chooseLocktime(NET, m as never, 5))).toBe('INVALID_INPUT');
    expect(chooseLocktime(NET, 'zero')).toBe(0);
    for (const o of [null, 5, 'x', []]) expect(codeOf(() => chooseSequence(NET, o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => chooseSequence(NET, { rbf: false, acknowledgeUnusual: 'yes' as never }))).toBe('POLICY_REJECTED');
    expect(codeOf(() => chooseSequence(NET, { rbf: 'no' as never }))).toBe('INVALID_INPUT');
    expect(chooseSequence(NET, { rbf: false, acknowledgeUnusual: true }).warning).toMatch(/unusual/);
  });
  it('sequence assertions need integer arrays; an empty input list is not a "final" conflict (regression)', () => {
    for (const v of [undefined, null, 'x', {}, [1.5], ['1'], [-1], [2 ** 32], [null]]) {
      expect(codeOf(() => assertUniformSequences(v as never))).toBe('INVALID_INPUT');
      expect(codeOf(() => assertLocktimeEffective(5, v as never))).toBe('INVALID_INPUT');
    }
    for (const l of [undefined, null, '5', -1, 1.5, 2 ** 32, NaN]) expect(codeOf(() => assertLocktimeEffective(l as never, [0xfffffffd]))).toBe('INVALID_INPUT');
    expect(codeOf(() => assertLocktimeEffective(5, []))).toBe('INVALID_INPUT');
    expect(codeOf(() => assertLocktimeEffective(0, []))).toBe('NO_THROW');
    expect(codeOf(() => assertLocktimeEffective(5, [0xffffffff, 0xffffffff]))).toBe('CONFLICT');
    expect(codeOf(() => assertLocktimeEffective(5, [0xffffffff, 0xfffffffd]))).toBe('NO_THROW');
    expect(codeOf(() => assertUniformSequences([1, 2]))).toBe('CONFLICT');
    expect(codeOf(() => assertUniformSequences([]))).toBe('NO_THROW');
  });
});

describe('MH-BTC-5 ordering: untrusted inputs and invariants', () => {
  const inp = (txid: string, vout: number) => ({ txid, vout });
  it('validates every item, arrays, strategy and rng', () => {
    for (const v of [undefined, null, 'x', {}, new Set()]) {
      expect(codeOf(() => orderInputs(NET, v as never, 'bip69'))).toBe('INVALID_INPUT');
      expect(codeOf(() => orderOutputs(NET, v as never, 'bip69'))).toBe('INVALID_INPUT');
    }
    for (const i of [null, 5, {}, inp('zz'.repeat(32), 0), inp(TXID, -1), inp(TXID, 1.5), inp(TXID, 2 ** 32), inp(TXID, '0' as never), inp(`${TXID}\n`, 0), inp(TXID.slice(2), 0)]) {
      expect(codeOf(() => orderInputs(NET, [i as never], 'bip69'))).toBe('INVALID_INPUT');
    }
    for (const o of [null, 5, {}, { amountSats: 5, scriptPubKey: 'aa' }, { amountSats: -1n, scriptPubKey: 'aa' }, { amountSats: 1n, scriptPubKey: 'a' }, { amountSats: 1n, scriptPubKey: 'zz' }, { amountSats: 1n, scriptPubKey: 5 }, { amountSats: 1n, scriptPubKey: 'aa'.repeat(10_001) }]) {
      expect(codeOf(() => orderOutputs(NET, [o as never], 'bip69'))).toBe('INVALID_INPUT');
    }
    for (const st of ['BIP69', '', null, undefined, 5, 'sort']) {
      expect(codeOf(() => orderInputs(NET, [], st as never))).toBe('INVALID_INPUT');
      expect(codeOf(() => orderOutputs(NET, [], st as never))).toBe('INVALID_INPUT');
    }
  });
  it('bounds the list sizes', () => {
    expect(codeOf(() => orderInputs(NET, Array.from({ length: 10_001 }, (_, i) => inp(TXID, i)), 'none'))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(() => orderOutputs(NET, Array.from({ length: 10_001 }, () => ({ amountSats: 1n, scriptPubKey: 'aa' })), 'none'))).toBe('LIMIT_EXCEEDED');
  });
  it('is a permutation, does not mutate frozen input, and bip69 is idempotent (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ txid: fc.stringMatching(/^[0-9a-f]{64}$/), vout: fc.nat({ max: 5 }) }), { maxLength: 12 }), fc.nat(), (list, seed) => {
        const frozen = Object.freeze(list.map((x) => Object.freeze(x)));
        for (const strategy of ['bip69', 'shuffle', 'none'] as const) {
          const r = orderInputs(NET, frozen, strategy, seededRng(seed + 1));
          expect([...r.order].sort((a, b) => a - b)).toEqual(frozen.map((_, i) => i));
          expect(r.items).toEqual(r.order.map((i) => frozen[i]));
        }
        const once = orderInputs(NET, frozen, 'bip69');
        expect(orderInputs(NET, once.items, 'bip69').items).toEqual(once.items);
      }),
      { seed: 0x6d68, numRuns: 200 },
    );
  });
});

describe('MH-BTC-6 stripPsbtFingerprints: malformed PSBT maps', () => {
  const psbt: PlainPsbt = {
    global: [{ keyType: 0x00, key: '', value: 'aa' }, { keyType: 0x01, key: 'xpub', value: 'bb' }, { keyType: 0xfc, key: 'proprietary', value: 'cc' }],
    inputs: [[{ keyType: 0x01, key: '', value: 'aa' }, { keyType: 0x06, key: 'pk', value: 'path' }, { keyType: 0x16, key: 'pk', value: 'taproot path' }]],
    outputs: [[{ keyType: 0x02, key: 'pk', value: 'path' }, { keyType: 0x03, key: '', value: '01' }]],
  };
  it('keeps only needed records and counts what it removed, without mutating', () => {
    const frozen = JSON.parse(JSON.stringify(psbt)) as PlainPsbt;
    Object.freeze(frozen.global);
    const r = stripPsbtFingerprints(NET, frozen);
    expect(r.removed).toBe(5);
    expect(r.psbt.global.map((x) => x.keyType)).toEqual([0x00]);
    expect(r.psbt.inputs[0]?.map((x) => x.keyType)).toEqual([0x01]);
    expect(r.psbt.outputs[0]?.map((x) => x.keyType)).toEqual([0x03]);
    expect(stripPsbtFingerprints(NET, r.psbt)).toEqual({ psbt: r.psbt, removed: 0 });
    expect(frozen.global).toHaveLength(3);
  });
  it('fails typed on malformed structure instead of leaking TypeError', () => {
    for (const v of [undefined, null, 5, 'x', [], {}, { global: 'x', inputs: [], outputs: [] }, { global: [], inputs: [5], outputs: [] }, { global: [], inputs: [], outputs: {} }, { global: [null], inputs: [], outputs: [] }, { global: [{ keyType: '0', key: '', value: '' }], inputs: [], outputs: [] }, { global: [{ keyType: 1.5, key: '', value: '' }], inputs: [], outputs: [] }, { global: [{ keyType: 256, key: '', value: '' }], inputs: [], outputs: [] }]) {
      expect(codeOf(() => stripPsbtFingerprints(NET, v as never))).toBe('INVALID_INPUT');
    }
  });
  it('bounds record counts', () => {
    const many = Array.from({ length: 100_001 }, () => ({ keyType: 0, key: '', value: '' }));
    expect(codeOf(() => stripPsbtFingerprints(NET, { global: many, inputs: [], outputs: [] }))).toBe('LIMIT_EXCEEDED');
  });
});
