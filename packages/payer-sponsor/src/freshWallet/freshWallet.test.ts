/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { privateKeyToAddress } from 'viem/accounts';
import { bytesToHex, type Address } from 'viem';
import { derivePayerKey, withPayerKey } from './derive.js';
import { DEFAULT_MIN_DELAY_MS, TOKEN_FUNDING_WARNING, planFunding, type FundingPlanInput } from './fundingPlan.js';
import { lintFunding } from './lint.js';
import { fetchFundingHistory } from './hygiene.js';
import type { FundingTx } from './types.js';
import { roundUpSigFigs, ceilDiv } from '../util.js';

const a = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}`;
const seed = new Uint8Array(32).fill(7);
const inv = (n: number) => new Uint8Array([n, 1, 2]);

describe('derivePayerKey (PH-1-REQ-1)', () => {
  it('is deterministic and the address matches the key', () => {
    const k1 = derivePayerKey(seed, inv(1), 0);
    const k2 = derivePayerKey(seed, inv(1), 0);
    expect(k1.address).toBe(k2.address);
    expect(k1.privateKey.use((b) => privateKeyToAddress(bytesToHex(b)))).toBe(k1.address);
    k1.privateKey.dispose();
    k2.privateKey.dispose();
  });
  it('distinct (invoiceId, index) and distinct seeds give distinct keys', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      for (let idx = 0; idx < 3; idx++) {
        const d = derivePayerKey(seed, inv(i), idx);
        seen.add(d.address);
        d.privateKey.dispose();
      }
    }
    const other = derivePayerKey(new Uint8Array(32).fill(8), inv(0), 0);
    seen.add(other.address);
    other.privateKey.dispose();
    expect(seen.size).toBe(61);
  });
  it('keys are not exposed by serialisation and are zeroed on dispose', () => {
    const d = derivePayerKey(seed, inv(1), 0);
    expect(() => JSON.stringify(d.privateKey)).toThrow();
    d.privateKey.dispose();
    expect(d.privateKey.disposed).toBe(true);
    expect(() => d.privateKey.use(() => 1)).toThrow();
  });
  it('withPayerKey disposes on success and on error', async () => {
    let box: { disposed: boolean } | undefined;
    await withPayerKey(seed, inv(1), 0, async (k) => {
      box = k;
      return 1;
    });
    expect(box?.disposed).toBe(true);
    await expect(
      withPayerKey(seed, inv(1), 1, async (k) => {
        box = k;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(box?.disposed).toBe(true);
  });
  it('validates inputs', () => {
    expect(() => derivePayerKey(new Uint8Array(8), inv(1), 0)).toThrow();
    expect(() => derivePayerKey(seed, new Uint8Array(0), 0)).toThrow();
    expect(() => derivePayerKey(seed, new Uint8Array(256), 0)).toThrow();
    expect(() => derivePayerKey(seed, inv(1), -1)).toThrow();
    expect(() => derivePayerKey(seed, inv(1), 2 ** 32)).toThrow();
    expect(() => derivePayerKey(seed, inv(1), 1.5)).toThrow();
  });
  it('property: different indices never collide', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (i, j) => {
        fc.pre(i !== j);
        const x = derivePayerKey(seed, inv(1), i);
        const y = derivePayerKey(seed, inv(1), j);
        const same = x.address === y.address;
        x.privateKey.dispose();
        y.privateKey.dispose();
        return !same;
      }),
      { numRuns: 25 },
    );
  });
});

describe('rounding helpers', () => {
  it('roundUpSigFigs rounds up to 2 significant figures', () => {
    expect(roundUpSigFigs(0n)).toBe(0n);
    expect(roundUpSigFigs(99n)).toBe(99n);
    expect(roundUpSigFigs(123n)).toBe(130n);
    expect(roundUpSigFigs(1_234_567n)).toBe(1_300_000n);
    expect(roundUpSigFigs(1_200_000n)).toBe(1_200_000n);
    expect(roundUpSigFigs(1_234_567n, 3)).toBe(1_240_000n);
    expect(() => roundUpSigFigs(-1n)).toThrow();
    expect(() => roundUpSigFigs(1n, 0)).toThrow();
  });
  it('property: result >= input and keeps at most 2 significant digits', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 30n }), (x) => {
        const r = roundUpSigFigs(x);
        const s = r.toString();
        return r >= x && s.replace(/0+$/, '').length <= 2 + (s.length <= 2 ? s.length : 0) && r - x <= x / 10n + 1n;
      }),
    );
  });
  it('ceilDiv', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(0n, 3n)).toBe(0n);
    expect(() => ceilDiv(1n, 0n)).toThrow();
  });
});

const input: FundingPlanInput = {
  payer: a(1),
  funder: a(2),
  tokenSource: a(3),
  neededToken: 1_000n,
  neededGasWei: 123_456_789n,
  knownMine: [a(10), a(11)],
  sellerDestinations: [a(20)],
  chainId: 31337,
};

describe('planFunding (PH-1-REQ-2/4/6)', () => {
  it('rounds gas up, draws a delay in [min, 3*min] and always carries the token funding warning', () => {
    const p = planFunding(input, () => 0);
    expect(p.ok).toBe(true);
    expect(p.roundedGasWei).toBe(130_000_000n);
    expect(p.delayMs).toBe(DEFAULT_MIN_DELAY_MS);
    expect(p.steps.map((s) => s.kind)).toEqual(['native', 'token']);
    expect(p.steps.every((s) => s.afterMs === p.delayMs)).toBe(true);
    expect(p.warnings).toContainEqual(TOKEN_FUNDING_WARNING);
    expect(planFunding(input, () => 0.999999).delayMs).toBeLessThanOrEqual(3 * DEFAULT_MIN_DELAY_MS);
    expect(planFunding({ ...input, minDelayMs: 1000 }, () => 0.5).delayMs).toBe(2000);
  });
  it('property: delay bounds and round-up for any rng and amount', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.bigInt({ min: 0n, max: 10n ** 20n }), (r, g) => {
        const p = planFunding({ ...input, neededGasWei: g }, () => r);
        return p.delayMs >= DEFAULT_MIN_DELAY_MS && p.delayMs <= 3 * DEFAULT_MIN_DELAY_MS && p.roundedGasWei >= g;
      }),
    );
  });
  it('refuses a known funder or token source with FUNDER_IS_KNOWN and no steps', () => {
    for (const bad of [{ funder: a(10) }, { funder: a(20) }, { tokenSource: a(11) }, { tokenSource: a(20) }]) {
      const p = planFunding({ ...input, ...bad }, () => 0.1);
      expect(p.ok).toBe(false);
      expect(p.steps).toEqual([]);
      expect(p.warnings[0]?.code).toBe('FUNDER_IS_KNOWN');
      expect(p.warnings.map((w) => w.code)).toContain('TOKEN_FUNDING_LINK');
    }
  });
  it('omits steps with zero amounts and the token step without a source', () => {
    const p = planFunding({ ...input, tokenSource: undefined, neededGasWei: 0n }, () => 0);
    expect(p.steps).toEqual([]);
    expect(planFunding({ ...input, tokenSource: undefined }, () => 0).steps).toHaveLength(1);
    expect(planFunding({ ...input, neededToken: 0n }, () => 0).steps).toHaveLength(1);
  });
  it('validates chain, rng and amounts', () => {
    expect(() => planFunding({ ...input, chainId: 1 }, () => 0)).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
    expect(() => planFunding(input, () => 1)).toThrow();
    expect(() => planFunding(input, () => -0.1)).toThrow();
    expect(() => planFunding({ ...input, minDelayMs: -1 }, () => 0)).toThrow();
    expect(() => planFunding({ ...input, neededGasWei: -1n }, () => 0)).toThrow();
  });
  it('performs no network I/O (fetch is never called)', () => {
    const g = globalThis as { fetch?: unknown };
    const real = g.fetch;
    let called = 0;
    g.fetch = () => {
      called++;
      throw new Error('network');
    };
    try {
      planFunding(input, () => 0.3);
      lintFunding([], [], [], { payer: a(1) });
    } finally {
      g.fetch = real;
    }
    expect(called).toBe(0);
  });
});

const T = 1_000_000;
const tx = (from: number, to: number, value: bigint, atMs = T, token?: Address): FundingTx => ({ from: a(from), to: a(to), value, atMs, token });
const codes = (txs: FundingTx[], opts: Parameters<typeof lintFunding>[3] = { payer: a(1) }) =>
  lintFunding(txs, [a(10)], new Set([a(20)]), opts).map((w) => w.code);

describe('lintFunding (PH-1-REQ-3/7)', () => {
  it('is quiet for a clean funding', () => {
    expect(codes([tx(2, 1, 123n)], { payer: a(1), requiredGasWei: 100n, paymentAtMs: T + 3 * DEFAULT_MIN_DELAY_MS })).toEqual([]);
  });
  it('SAME_SENDER_RECEIVER: funder is a seller destination', () => {
    expect(codes([tx(20, 1, 5n)])).toContain('SAME_SENDER_RECEIVER');
  });
  it('SHARED_FUNDER: funder also funded a known wallet or an earlier payer', () => {
    expect(codes([tx(2, 1, 5n), tx(2, 10, 5n)])).toContain('SHARED_FUNDER');
    expect(codes([tx(2, 1, 5n), tx(2, 30, 5n)], { payer: a(1), priorPayers: [a(30)] })).toContain('SHARED_FUNDER');
    expect(codes([tx(2, 1, 5n), tx(3, 10, 5n)])).not.toContain('SHARED_FUNDER');
  });
  it('EXACT_AMOUNT: native funding equals the minimum to the wei (token transfers ignored)', () => {
    expect(codes([tx(2, 1, 100n)], { payer: a(1), requiredGasWei: 100n })).toContain('EXACT_AMOUNT');
    expect(codes([tx(2, 1, 101n)], { payer: a(1), requiredGasWei: 100n })).not.toContain('EXACT_AMOUNT');
    expect(codes([tx(2, 1, 100n, T, a(99))], { payer: a(1), requiredGasWei: 100n })).not.toContain('EXACT_AMOUNT');
  });
  it('NO_DELAY: payment too soon after the last native funding', () => {
    const early = { payer: a(1), paymentAtMs: T + 1000 };
    expect(codes([tx(2, 1, 5n)], early)).toContain('NO_DELAY');
    expect(codes([tx(2, 1, 5n)], { ...early, paymentAtMs: T + DEFAULT_MIN_DELAY_MS })).not.toContain('NO_DELAY');
    expect(codes([tx(2, 1, 5n)], { ...early, minDelayMs: 500 })).not.toContain('NO_DELAY');
    expect(codes([], early)).not.toContain('NO_DELAY');
  });
  it('LEFTOVER_RETURN: residual sent back to the funder', () => {
    expect(codes([tx(2, 1, 5n), tx(1, 2, 1n)])).toContain('LEFTOVER_RETURN');
    expect(codes([tx(2, 1, 5n), tx(1, 3, 1n)])).not.toContain('LEFTOVER_RETURN');
    expect(codes([tx(2, 1, 5n), tx(1, 2, 1n, T, a(99))])).not.toContain('LEFTOVER_RETURN');
  });
  it('PAYER_REUSE and duplicate suppression', () => {
    expect(codes([], { payer: a(1), usedPayers: [a(1)] })).toEqual(['PAYER_REUSE']);
    const w = lintFunding([tx(20, 1, 5n), tx(20, 1, 6n)], [], [a(20)], { payer: a(1) });
    expect(w.filter((x) => x.code === 'SAME_SENDER_RECEIVER')).toHaveLength(1);
  });
});

describe('fetchFundingHistory', () => {
  it('delegates to the source after the testnet guard', async () => {
    const calls: number[] = [];
    const source = { fundingTransfers: async (id: number) => (calls.push(id), [tx(2, 1, 1n)]) };
    await expect(fetchFundingHistory(source, 31337, a(1))).resolves.toHaveLength(1);
    expect(calls).toEqual([31337]);
    await expect(fetchFundingHistory(source, 1, a(1))).rejects.toMatchObject({ code: 'MAINNET_FORBIDDEN' });
    expect(calls).toEqual([31337]);
  });
});
