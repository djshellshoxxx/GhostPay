import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { assertPoolChain, POOL_CHAIN_IDS } from './chain.js';
import { PoolSdkError } from './errors.js';
import { SNARK_SCALAR_FIELD, assertField, assertValue, inField, os2ip } from './field.js';
import { POSEIDON_VECTORS, assertPoseidonVectors, poseidonT2, poseidonT3, poseidonT4 } from './poseidon.js';
import { commitment, deriveNoteSecrets, noteCommitment, nullifierHash, precommitment } from './notes.js';
import { PoolTree } from './tree.js';
import { contextOf, encodeWithdrawal, maxFee, type Withdrawal } from './withdrawal.js';
import { OTHER_SEED, POOL, SEED, withOther, withSeed } from './fixtures.testutil.js';

describe('chain guard', () => {
  it('accepts only testnets', () => {
    for (const c of POOL_CHAIN_IDS) expect(() => assertPoolChain(c)).not.toThrow();
    for (const c of [1, 8453, 0, -1, 1.5, NaN]) expect(() => assertPoolChain(c)).toThrow(PoolSdkError);
  });
});

describe('field', () => {
  it('range checks', () => {
    expect(inField(0n)).toBe(true);
    expect(inField(SNARK_SCALAR_FIELD)).toBe(false);
    expect(inField(-1n)).toBe(false);
    expect(() => assertField(SNARK_SCALAR_FIELD, 'x')).toThrow(/field/);
    expect(() => assertField(1 as unknown as bigint, 'x')).toThrow(/field/);
    expect(() => assertValue(0n, 'v')).toThrow(/range/);
    expect(() => assertValue(1n << 128n, 'v')).toThrow(/range/);
    expect(() => assertValue(5 as unknown as bigint, 'v')).toThrow(/range/);
    expect(() => assertValue(1n, 'v')).not.toThrow();
    expect(os2ip(Uint8Array.of(1, 0))).toBe(256n);
  });
});

describe('poseidon', () => {
  it('matches circomlib vectors', () => {
    expect(poseidonT2(1n)).toBe(POSEIDON_VECTORS.t2.out);
    expect(poseidonT3(1n, 2n)).toBe(POSEIDON_VECTORS.t3.out);
    expect(poseidonT4(1n, 2n, 3n)).toBe(POSEIDON_VECTORS.t4.out);
    expect(() => assertPoseidonVectors()).not.toThrow();
  });
});

describe('poseidon load check', () => {
  it('fails closed on a mismatching implementation (VECTOR_MISMATCH)', async () => {
    vi.resetModules();
    vi.doMock('poseidon-lite', () => ({ poseidon1: () => 1n, poseidon2: () => 1n, poseidon3: () => 1n }));
    const m = await import('./poseidon.js');
    expect(() => m.poseidonT3(1n, 2n)).toThrow(/circomlib/);
    vi.doUnmock('poseidon-lite');
    vi.resetModules();
  });
});

describe('notes', () => {
  it('derives deterministically and per chain/pool/index', () => {
    const a = deriveNoteSecrets(withSeed, 31337, POOL, 0);
    expect(deriveNoteSecrets(withSeed, 31337, POOL, 0)).toEqual(a);
    expect(deriveNoteSecrets(withSeed, 31337, POOL, 1)).not.toEqual(a);
    expect(deriveNoteSecrets(withSeed, 84532, POOL, 0)).not.toEqual(a);
    expect(deriveNoteSecrets(withSeed, 31337, '0x1000000000000000000000000000000000000002', 0)).not.toEqual(a);
    expect(deriveNoteSecrets(withOther, 31337, POOL, 0)).not.toEqual(a);
    expect(a.nullifier).not.toBe(a.secret);
    expect(inField(a.nullifier) && inField(a.secret) && a.nullifier > 0n && a.secret > 0n).toBe(true);
    expect(OTHER_SEED.length).toBe(32);
    expect(SEED.length).toBe(32);
  });
  it('does not leak the seed object and validates input', () => {
    expect(() => deriveNoteSecrets(withSeed, 1, POOL, 0)).toThrow(/testnet/);
    expect(() => deriveNoteSecrets(withSeed, 31337, POOL, -1)).toThrow(/index/);
    expect(() => deriveNoteSecrets(withSeed, 31337, POOL, 2 ** 32)).toThrow(/index/);
    expect(() => deriveNoteSecrets((f) => f(new Uint8Array(8)), 31337, POOL, 0)).toThrow(/short/);
  });
  it('hash helpers', () => {
    const s = deriveNoteSecrets(withSeed, 31337, POOL, 0);
    const pre = precommitment(s);
    expect(pre).toBe(poseidonT3(s.nullifier, s.secret));
    expect(commitment(5n, 7n, pre)).toBe(poseidonT4(5n, 7n, pre));
    expect(nullifierHash(s.nullifier)).toBe(poseidonT2(s.nullifier));
    expect(noteCommitment({ value: 5n, label: 7n, ...s })).toBe(commitment(5n, 7n, pre));
    expect(() => precommitment({ nullifier: SNARK_SCALAR_FIELD, secret: 1n })).toThrow();
    expect(() => precommitment({ nullifier: 1n, secret: SNARK_SCALAR_FIELD })).toThrow();
    expect(() => commitment(1n, SNARK_SCALAR_FIELD, 1n)).toThrow();
    expect(() => nullifierHash(SNARK_SCALAR_FIELD)).toThrow();
  });
  it('property: different indices give different notes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), (i, j) => {
        const a = deriveNoteSecrets(withSeed, 31337, POOL, i);
        const b = deriveNoteSecrets(withSeed, 31337, POOL, j);
        return (i === j) === (a.nullifier === b.nullifier);
      }),
      { numRuns: 25 },
    );
  });
});

describe('PoolTree', () => {
  it('lean IMT semantics', () => {
    const t = new PoolTree();
    expect(t.root()).toBe(0n);
    expect(t.size).toBe(0);
    t.insert(11n);
    expect(t.root()).toBe(11n);
    expect(t.depth()).toBe(0);
    t.insert(22n);
    expect(t.root()).toBe(poseidonT3(11n, 22n));
    t.insert(33n);
    expect(t.root()).toBe(poseidonT3(poseidonT3(11n, 22n), 33n));
    expect(t.depth()).toBe(2);
    const p = t.proof(2);
    expect(p.siblings.length).toBe(32);
    expect(p.siblings[0]).toBe(0n);
    expect(p.siblings[1]).toBe(poseidonT3(11n, 22n));
    expect(p.leafIndex).toBe(2);
    expect(p.root).toBe(t.root());
    expect(t.leaf(1)).toBe(22n);
    expect(t.indexOf(33n)).toBe(2);
    expect(t.indexOf(99n)).toBe(-1);
    expect(() => t.leaf(9)).toThrow();
    expect(() => t.proof(3)).toThrow();
    expect(() => t.proof(-1)).toThrow();
    expect(() => t.insert(SNARK_SCALAR_FIELD)).toThrow();
  });
  it('proof reconstructs the root (circuit semantics: zero sibling = propagate)', () => {
    const t = new PoolTree();
    for (let i = 1; i <= 33; i++) t.insert(BigInt(i) * 7919n);
    for (const i of [0, 5, 16, 32]) {
      const p = t.proof(i);
      let node = p.leaf;
      for (let l = 0; l < p.depth; l++) {
        const s = p.siblings[l] as bigint;
        if (s === 0n) continue;
        node = (i >> l) & 1 ? poseidonT3(s, node) : poseidonT3(node, s);
      }
      expect(node).toBe(p.root);
      for (let l = 0; l < 32; l++) if (p.siblings[l] === 0n) expect((i >> l) & 1).toBe(0);
    }
  });
});

describe('withdrawal encoding', () => {
  const w: Withdrawal = {
    recipient: '0x00000000000000000000000000000000000000a1',
    relayer: '0x00000000000000000000000000000000000000a2',
    relayerFee: 5n,
    feeTo: '0x00000000000000000000000000000000000000a3',
    deadline: 1000n,
    aspPublisher: '0x0000000000000000000000000000000000000000',
    announce: '0x',
  };
  it('encodes as a dynamic tuple', () => {
    const e = encodeWithdrawal(w);
    expect(e.startsWith(`0x${'0'.repeat(62)}20`)).toBe(true);
  });
  it('context binds every field', () => {
    const base = contextOf(w, 77n);
    expect(base).toBeLessThan(SNARK_SCALAR_FIELD);
    expect(contextOf(w, 77n)).toBe(base);
    expect(contextOf(w, 78n)).not.toBe(base);
    const variants: Partial<Withdrawal>[] = [
      { recipient: '0x00000000000000000000000000000000000000b1' },
      { relayer: '0x00000000000000000000000000000000000000b2' },
      { relayerFee: 6n },
      { feeTo: '0x00000000000000000000000000000000000000b3' },
      { deadline: 1001n },
      { aspPublisher: '0x00000000000000000000000000000000000000b4' },
      { announce: '0x01' },
    ];
    for (const v of variants) expect(contextOf({ ...w, ...v }, 77n)).not.toBe(base);
    expect(() => contextOf(w, SNARK_SCALAR_FIELD)).toThrow();
    expect(() => contextOf(w, -1n)).toThrow();
  });
  it('maxFee rounds down', () => {
    expect(maxFee(999n, 1000n)).toBe(99n);
  });
});
