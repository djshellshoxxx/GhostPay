import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addAmountNoise, assertSingleAmountMode, isPaid, roundGross } from './amounts.js';
import { deriveChainKeys, deriveInvoiceKeyRange, deriveInvoiceKeys } from './derive.js';
import { assertOnlyAllowedTxFields, bucketGasLimit } from './gas.js';
import { MetadataHardeningError } from './guard.js';
import {
  buildMinimalMetadata,
  classifyMetadata,
  describeTagMode,
  encodeViewTagByte,
  isAcceptedScheme,
  parseTagMode,
  resolveSchemePolicy,
  validateAnnouncerConfig,
  viewTagAccepts,
} from './tags.js';
import { seededRng, SEED } from './testutil.testutil.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

const NOT_BIGINT = [undefined, null, 5, '5', 5.5, true, {}, [], () => 1n, Symbol('x'), NaN];
const NOT_OBJECT = [undefined, null, 5, 'x', true, []];

describe('MH-AMT / MH-WAL: bigint and options contracts', () => {
  it('roundGross needs a bigint amount and an options object (regression: TypeError leaked)', () => {
    const opts = { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 100 } as const;
    for (const v of NOT_BIGINT) expect(codeOf(() => roundGross(v as never, opts))).toBe('INVALID_INPUT');
    for (const o of NOT_OBJECT) expect(codeOf(() => roundGross(5n, o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => roundGross(5n, { ...opts, amountPolicyMode: 'other' as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => roundGross(5n, { ...opts, amountPolicyMode: undefined as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => roundGross(1n << 256n, opts))).toBe('INVALID_INPUT');
  });
  it('addAmountNoise and isPaid need bigints', () => {
    for (const v of NOT_BIGINT) {
      expect(codeOf(() => addAmountNoise(v as never, { chainId: 31337, maxBps: 10 }))).toBe('INVALID_INPUT');
      expect(codeOf(() => isPaid(v as never, 1n))).toBe('INVALID_INPUT');
      expect(codeOf(() => isPaid(1n, v as never))).toBe('INVALID_INPUT');
    }
    for (const o of NOT_OBJECT) expect(codeOf(() => addAmountNoise(5n, o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => addAmountNoise(1n << 256n, { chainId: 31337, maxBps: 10 }))).toBe('INVALID_INPUT');
  });
  it('assertSingleAmountMode needs booleans', () => {
    for (const o of NOT_OBJECT) expect(codeOf(() => assertSingleAmountMode(o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => assertSingleAmountMode({ rounding: 'yes', noise: true } as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => assertSingleAmountMode({ rounding: true, noise: true }))).toBe('CONFLICT');
    expect(codeOf(() => assertSingleAmountMode({ rounding: false, noise: true }))).toBe('NO_THROW');
  });
  it('bucketGasLimit needs a bigint estimate and an options object', () => {
    for (const v of NOT_BIGINT) expect(codeOf(() => bucketGasLimit(v as never, { chainId: 31337 }))).toBe('INVALID_INPUT');
    for (const o of NOT_OBJECT) expect(codeOf(() => bucketGasLimit(5n, o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => bucketGasLimit(5n, { chainId: 31337, bucket: 10 as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => bucketGasLimit(1n << 256n, { chainId: 31337 }))).toBe('INVALID_INPUT');
  });
  it('rounding properties hold for random amounts (>= input, bounded surplus, idempotent)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: (1n << 200n) }), fc.integer({ min: 1, max: 18 }), (amount, sigFigs) => {
        const r = roundGross(amount, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 10_000, sigFigs });
        expect(r.amount).toBeGreaterThanOrEqual(amount);
        expect(r.surplus).toBe(r.amount - amount);
        const again = roundGross(r.amount, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 10_000, sigFigs });
        expect(again.amount).toBe(r.amount);
        const gas = (amount % (1n << 60n)) + 1n;
        const g = bucketGasLimit(gas, { chainId: 31337, bucket: 1000n });
        expect(g >= gas && g % 1000n === 0n && g - gas < 1000n).toBe(true);
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});

describe('MH-WAL-1 assertOnlyAllowedTxFields: field names never inject log lines', () => {
  it('echoes only a plain identifier, truncated; anything else is described generically', () => {
    try {
      assertOnlyAllowedTxFields({ maxFeePerGas: 1 });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toBe('tx field not allowed: maxFeePerGas');
    }
    for (const key of ['a\nINFO forged line', 'k\r\n', 'x'.repeat(5) + '‮', 'tab\there', '0xdeadbeef', 'sentinel-secret-7f3a', 'a b', '', '\u0000']) {
      try {
        assertOnlyAllowedTxFields({ [key]: 1 });
        expect.unreachable();
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toMatch(/[\n\r\t\u202e]/);
        expect(msg.includes('\u0000')).toBe(false);
        expect(msg).not.toContain('sentinel');
        expect(msg).not.toContain('deadbeef');
        expect((e as MetadataHardeningError).code).toBe('POLICY_REJECTED');
      }
    }
    try {
      assertOnlyAllowedTxFields({ ['f'.repeat(60)]: 1 });
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(60);
    }
  });
  it('requires a plain object, ignores inherited keys, and does not mutate', () => {
    for (const v of [undefined, null, 5, 'x', [], [1]]) expect(codeOf(() => assertOnlyAllowedTxFields(v as never))).toBe('INVALID_INPUT');
    const tx = Object.freeze({ from: '0x1', to: '0x2', data: '0x', value: 0n, chainId: 1, gas: 1n });
    expect(codeOf(() => assertOnlyAllowedTxFields(tx))).toBe('NO_THROW');
    expect(codeOf(() => assertOnlyAllowedTxFields({ ...tx, nonce: 1 }))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertOnlyAllowedTxFields(Object.create({ maxFeePerGas: 1 }) as Record<string, unknown>))).toBe('NO_THROW');
    const sym = { [Symbol('fee')]: 1 };
    expect(codeOf(() => assertOnlyAllowedTxFields(sym))).toBe('NO_THROW');
  });
});

describe('MH-TAG: hand-built modes and loose truthiness', () => {
  const full = parseTagMode('full');
  it('rejects hand-built tag modes outside the grammar (regression: bits 0, 8 and unknown kinds were accepted)', () => {
    for (const mode of [{ kind: 'mask', bits: 0 }, { kind: 'mask', bits: 8 }, { kind: 'mask', bits: 9 }, { kind: 'mask', bits: 1.5 }, { kind: 'mask' }, { kind: 'weird' }, { kind: 'full', extra: 1 }, null, undefined, 'full', 5, []]) {
      expect(codeOf(() => encodeViewTagByte(5, mode as never)), JSON.stringify(mode)).toBe('INVALID_INPUT');
      expect(codeOf(() => viewTagAccepts(5, 5, mode as never))).toBe('INVALID_INPUT');
      expect(codeOf(() => describeTagMode(mode as never))).toBe('INVALID_INPUT');
    }
    expect(describeTagMode(full)).toMatch(/Full view tag/);
  });
  it('parseTagMode rejects non-strings, near-misses and anything with surrounding text', () => {
    for (const s of [undefined, null, 5, {}, ['full'], 'FULL', ' full', 'full ', 'mask:0', 'mask:8', 'mask:10', 'mask:1\n', 'mask: 1', 'mask:１', '']) {
      expect(codeOf(() => parseTagMode(s as never)), Object.prototype.toString.call(s)).toBe('INVALID_INPUT');
    }
    expect(parseTagMode('mask:7')).toEqual({ kind: 'mask', bits: 7 });
  });
  it('view-tag bytes must be integers 0..255', () => {
    for (const b of [undefined, null, '5', 5.5, -1, 256, NaN, Infinity, 5n]) {
      expect(codeOf(() => encodeViewTagByte(b as never, full))).toBe('INVALID_INPUT');
      expect(codeOf(() => viewTagAccepts(b as never, 5, full))).toBe('INVALID_INPUT');
      expect(codeOf(() => buildMinimalMetadata(b as never))).toBe('INVALID_INPUT');
    }
  });
  it('classifyMetadata needs a real boolean for viaRouter (regression: the string "false" meant true)', () => {
    for (const v of ['false', 'true', 0, 1, null, undefined, {}]) expect(codeOf(() => classifyMetadata(57, v as never))).toBe('INVALID_INPUT');
    expect(classifyMetadata(57, true).accepted).toBe(true);
    expect(classifyMetadata(1, true)).toMatchObject({ accepted: false, reason: 'ROUTER_NEEDS_57' });
    expect(classifyMetadata(1, false)).toMatchObject({ accepted: true, amountStatus: 'unverified' });
    for (const n of [0, -1, 1.5, NaN, Infinity, '57', null, undefined]) expect(classifyMetadata(n as never, false)).toMatchObject({ accepted: false, reason: 'EMPTY' });
  });
  it('resolveSchemePolicy needs bigint ids and an options object (regression: number 5 produced an unmatchable policy)', () => {
    for (const id of [5, '5', 5.5, null, {}, [], 1n, 0n, -1n, 1n << 64n]) {
      expect(codeOf(() => resolveSchemePolicy({ unsafeFingerprintScheme: true, extraSchemeId: id as never })), typeof id).toBe('INVALID_INPUT');
    }
    for (const o of [null, 5, 'x', []]) expect(codeOf(() => resolveSchemePolicy(o as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => resolveSchemePolicy({ extraSchemeId: 5n }))).toBe('POLICY_REJECTED');
    expect(codeOf(() => resolveSchemePolicy({ unsafeFingerprintScheme: 'yes' as never, extraSchemeId: 5n }))).toBe('POLICY_REJECTED');
    const p = resolveSchemePolicy({ unsafeFingerprintScheme: true, extraSchemeId: 5n });
    expect(isAcceptedScheme(5n, p)).toBe(true);
    expect(codeOf(() => isAcceptedScheme(5 as never, p))).toBe('INVALID_INPUT');
    expect(codeOf(() => isAcceptedScheme(5n, null as never))).toBe('INVALID_INPUT');
    expect(Object.isFrozen(resolveSchemePolicy().accepted)).toBe(true);
  });
  it('validateAnnouncerConfig needs a string address', () => {
    for (const a of [undefined, null, 5, {}, [], '0x', 'x']) expect(codeOf(() => validateAnnouncerConfig(31337, a as never))).toBe('INVALID_INPUT');
  });
  it('mask encoding keeps the high bits for every tag and mode (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 1, max: 7 }), fc.nat(), (tag, bits, seed) => {
        const mode = parseTagMode(`mask:${bits}`);
        const out = encodeViewTagByte(tag, mode, seededRng(seed));
        expect(out >= 0 && out <= 255).toBe(true);
        expect(viewTagAccepts(out, tag, mode)).toBe(true);
      }),
      { seed: 0x6d68, numRuns: 400 },
    );
  });
});

describe('MH-ID derivation: runtime contracts', () => {
  it('rejects bad seeds (including a foreign-realm array lookalike) and options', async () => {
    for (const s of [undefined, null, 'x'.repeat(40), [], new Array(40).fill(1), new Uint8Array(31), new Uint16Array(32), { length: 32 }]) {
      expect(codeOf(() => deriveInvoiceKeys(s as never, 0))).toBe('INVALID_INPUT');
    }
    for (const o of [null, 5, 'x', []]) {
      expect(codeOf(() => deriveInvoiceKeys(SEED, 0, o as never))).toBe('INVALID_INPUT');
      expect(codeOf(() => deriveInvoiceKeyRange(SEED, 0, 1, o as never))).toBe('INVALID_INPUT');
    }
    for (const mode of ['per_invoice', 5, null, {}, 'LONG-LIVED', '__proto__']) {
      expect(codeOf(() => deriveInvoiceKeys(SEED, 0, { signerMode: mode as never }))).toBe('INVALID_INPUT');
    }
    for (const c of [null, '31337', 31337.5, 31337n, NaN]) {
      expect(codeOf(() => deriveInvoiceKeys(SEED, 0, { chainId: c as never }))).not.toBe('NO_THROW');
    }
    const vm = await import('node:vm');
    const foreign = vm.runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array;
    expect(deriveInvoiceKeys(foreign, 0).metaAddress).toBe(deriveInvoiceKeys(new Uint8Array(32).fill(7), 0).metaAddress);
  });
  it('rejects non-integer indexes and ranges, never touching the seed buffer', () => {
    const seed = SEED.slice();
    for (const i of [undefined, null, '0', 0.5, -1, 2 ** 32, NaN, 1n]) {
      expect(codeOf(() => deriveInvoiceKeys(seed, i as never))).toBe('INVALID_INPUT');
    }
    for (const [from, count] of [[0, 10_001], [-1, 1], [0.5, 1], [2 ** 32 - 1, 2], ['0', 1], [0, '1']]) {
      expect(codeOf(() => deriveInvoiceKeyRange(seed, from as never, count as never))).toBe('INVALID_INPUT');
    }
    expect(seed).toEqual(SEED);
  });
  it('is deterministic when repeated and never serialises key material', () => {
    const a = deriveChainKeys(SEED, 31337);
    const b = deriveChainKeys(SEED, 31337);
    expect(a.metaAddress).toBe(b.metaAddress);
    expect(() => JSON.stringify(a)).toThrow();
    expect(() => JSON.stringify(a.signer)).toThrow();
    expect(deriveInvoiceKeyRange(SEED, 0, 0)).toEqual([]);
  });
});
