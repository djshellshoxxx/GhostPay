import { LeanIMT } from '@zk-kit/lean-imt';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LeanImt,
  MAX_TREE_DEPTH,
  PoolCircuitError,
  SNARK_SCALAR_FIELD,
  VALUE_LIMIT,
  assertTestnetChain,
  buildRagequitInputs,
  buildWithdrawInputs,
  commitment,
  hashNode,
  nullifierHash,
  precommitment,
  toVerifierCalldata,
} from './index.js';
import type { CircuitNote, CircuitPath, SnarkjsProof } from './index.js';

const P = SNARK_SCALAR_FIELD;
const note: CircuitNote = { value: 1000n, label: 77n, nullifier: 11n, secret: 22n };

function treeWith(leaves: bigint[]): LeanImt {
  const t = new LeanImt();
  for (const l of leaves) t.insert(l);
  return t;
}

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof PoolCircuitError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('chain guard', () => {
  it('accepts testnets and refuses others', () => {
    for (const c of [31337, 11155111, 84532]) expect(() => assertTestnetChain(c)).not.toThrow();
    for (const c of [1, 8453, 10, 0]) expect(code(() => assertTestnetChain(c))).toBe('WRONG_CHAIN');
  });
});

describe('hashes', () => {
  it('known poseidon vectors (circomlib reference values)', () => {
    // Poseidon([1,2]) from circomlib's own test suite.
    expect(hashNode(1n, 2n)).toBe(
      7853200120776062878684798364095072458815029376092732009249414926327459813530n,
    );
    expect(nullifierHash(1n)).not.toBe(precommitment(1n, 0n));
  });
  it('rejects non-field inputs', () => {
    expect(code(() => nullifierHash(P))).toBe('NOT_FIELD');
    expect(code(() => precommitment(1n, -1n))).toBe('NOT_FIELD');
    expect(code(() => commitment(1n, 2n, P + 1n))).toBe('NOT_FIELD');
    expect(code(() => hashNode(P, 1n))).toBe('NOT_FIELD');
  });
  it('error carries name and message', () => {
    const e = new PoolCircuitError('BAD_INDEX', 'x');
    expect(e.name).toBe('PoolCircuitError');
    expect(e.message).toBe('BAD_INDEX: x');
  });
});

describe('LeanImt matches @zk-kit/lean-imt', () => {
  it('roots and paths for sizes 1..40', () => {
    const ref = new LeanIMT<bigint>((a, b) => hashNode(a, b));
    const mine = new LeanImt();
    expect(mine.root()).toBe(0n);
    expect(mine.depth).toBe(0);
    for (let i = 1; i <= 40; i++) {
      const leaf = nullifierHash(BigInt(i));
      ref.insert(leaf);
      mine.insert(leaf);
      expect(mine.root()).toBe(ref.root);
      expect(mine.depth).toBe(ref.depth);
      expect(mine.size).toBe(i);
      for (const idx of [0, i - 1, Math.floor(i / 2)]) {
        const p = mine.path(idx);
        expect(p.siblings).toHaveLength(MAX_TREE_DEPTH);
        const zk = ref.generateProof(idx);
        expect(p.siblings.filter((s) => s !== 0n)).toEqual(zk.siblings);
        // recompute root from the circuit-layout path (what the circuit does)
        let node = nullifierHash(BigInt(idx + 1));
        p.siblings.forEach((sib, lvl) => {
          if (sib === 0n) return;
          node = Math.floor(idx / 2 ** lvl) % 2 === 1 ? hashNode(sib, node) : hashNode(node, sib);
        });
        expect(node).toBe(p.root);
      }
    }
    expect(mine.indexOf(nullifierHash(3n))).toBe(2);
    expect(mine.indexOf(5n)).toBe(-1);
  });
  it('rejects zero / non-field leaves and bad indices', () => {
    const t = new LeanImt();
    expect(code(() => t.insert(0n))).toBe('NOT_FIELD');
    expect(code(() => t.insert(P))).toBe('NOT_FIELD');
    expect(code(() => t.path(0))).toBe('BAD_INDEX');
    t.insert(5n);
    expect(code(() => t.path(1))).toBe('BAD_INDEX');
    expect(code(() => t.path(0.5))).toBe('BAD_INDEX');
  });
  it('refuses insert when full', () => {
    const t = new LeanImt();
    Object.defineProperty(t, 'leaves', { value: { length: 2 ** MAX_TREE_DEPTH, push: () => 0 } });
    expect(code(() => t.insert(1n))).toBe('BAD_INDEX');
  });
});

function setup(): { path: CircuitPath; asp: CircuitPath } {
  const leaf = commitment(note.value, note.label, precommitment(note.nullifier, note.secret));
  const st = treeWith([9n, leaf, 10n]);
  const at = treeWith([note.label, 5n]);
  return { path: st.path(1), asp: at.path(0) };
}

describe('buildWithdrawInputs', () => {
  const base = (): Parameters<typeof buildWithdrawInputs>[0] => ({
    chainId: 31337,
    note,
    statePath: setup().path,
    withdrawnValue: 400n,
    newNullifier: 33n,
    newSecret: 44n,
    context: 123n,
  });
  it('builds aspEnabled=0 with zeroed ASP fields', () => {
    const w = buildWithdrawInputs(base());
    expect(w.aspEnabled).toBe('0');
    expect(w.ASPRoot).toBe('0');
    expect(w.ASPSiblings.every((s) => s === '0')).toBe(true);
    expect(w.stateIndex).toBe('1');
    expect(w.stateTreeDepth).toBe('2');
    expect(w.withdrawnValue).toBe('400');
  });
  it('builds aspEnabled=1', () => {
    const w = buildWithdrawInputs({ ...base(), aspPath: setup().asp });
    expect(w.aspEnabled).toBe('1');
    expect(w.ASPTreeDepth).toBe('1');
    expect(w.ASPIndex).toBe('0');
  });
  it('rejects every malformed argument', () => {
    const b = base();
    expect(code(() => buildWithdrawInputs({ ...b, chainId: 1 }))).toBe('WRONG_CHAIN');
    expect(code(() => buildWithdrawInputs({ ...b, withdrawnValue: VALUE_LIMIT }))).toBe('OUT_OF_RANGE');
    expect(code(() => buildWithdrawInputs({ ...b, withdrawnValue: -1n }))).toBe('OUT_OF_RANGE');
    expect(code(() => buildWithdrawInputs({ ...b, withdrawnValue: 1001n }))).toBe('OUT_OF_RANGE');
    expect(code(() => buildWithdrawInputs({ ...b, note: { ...note, value: VALUE_LIMIT } }))).toBe(
      'OUT_OF_RANGE',
    );
    expect(code(() => buildWithdrawInputs({ ...b, newNullifier: note.nullifier }))).toBe('SAME_NULLIFIER');
    expect(code(() => buildWithdrawInputs({ ...b, context: P }))).toBe('NOT_FIELD');
    expect(code(() => buildWithdrawInputs({ ...b, newSecret: P }))).toBe('NOT_FIELD');
    expect(code(() => buildWithdrawInputs({ ...b, note: { ...note, secret: P } }))).toBe('NOT_FIELD');
    const sp = b.statePath;
    expect(
      code(() => buildWithdrawInputs({ ...b, statePath: { ...sp, siblings: sp.siblings.slice(1) } })),
    ).toBe('BAD_INDEX');
    expect(code(() => buildWithdrawInputs({ ...b, statePath: { ...sp, depth: 33 } }))).toBe('BAD_INDEX');
    expect(code(() => buildWithdrawInputs({ ...b, statePath: { ...sp, index: -1 } }))).toBe('BAD_INDEX');
    expect(code(() => buildWithdrawInputs({ ...b, statePath: { ...sp, root: P } }))).toBe('NOT_FIELD');
    const above = sp.siblings.map((s, i) => (i === 5 ? 7n : s));
    expect(code(() => buildWithdrawInputs({ ...b, statePath: { ...sp, siblings: above } }))).toBe(
      'BAD_INDEX',
    );
    // index 3 at depth 2 in a 3-leaf tree: bit 0 set where... level-1 sibling exists, so use index 2 with bit for empty level
    const t = treeWith([1n, 2n, 3n]);
    const p2 = t.path(2); // level 0 has no sibling
    expect(code(() => buildWithdrawInputs({ ...b, statePath: { ...p2, index: 3 } }))).toBe('BAD_INDEX');
    expect(code(() => buildWithdrawInputs({ ...b, aspPath: { ...setup().asp, root: 0n } }))).toBe(
      'ASP_LABEL_MISSING',
    );
  });
});

describe('buildRagequitInputs', () => {
  it('builds and validates', () => {
    expect(buildRagequitInputs(84532, note)).toEqual({
      value: '1000',
      label: '77',
      nullifier: '11',
      secret: '22',
    });
    expect(code(() => buildRagequitInputs(1, note))).toBe('WRONG_CHAIN');
    expect(code(() => buildRagequitInputs(31337, { ...note, value: VALUE_LIMIT }))).toBe('OUT_OF_RANGE');
    expect(code(() => buildRagequitInputs(31337, { ...note, nullifier: P }))).toBe('NOT_FIELD');
    expect(code(() => buildRagequitInputs(31337, { ...note, label: P }))).toBe('NOT_FIELD');
  });
});

describe('toVerifierCalldata', () => {
  const proof: SnarkjsProof = {
    pi_a: ['1', '2', '1'],
    pi_b: [
      ['3', '4'],
      ['5', '6'],
      ['1', '0'],
    ],
    pi_c: ['7', '8', '1'],
  };
  it('swaps G2 coordinates', () => {
    const c = toVerifierCalldata(proof, ['9', '10', '11', '12'], 4);
    expect(c.pA).toEqual(['1', '2']);
    expect(c.pB).toEqual([
      ['4', '3'],
      ['6', '5'],
    ]);
    expect(c.pC).toEqual(['7', '8']);
    expect(c.pubSignals).toEqual(['9', '10', '11', '12']);
  });
  it('rejects shape and field errors', () => {
    expect(code(() => toVerifierCalldata(proof, ['1'], 4))).toBe('BAD_PROOF_SHAPE');
    expect(code(() => toVerifierCalldata(proof, ['1', '2', '3', P.toString()], 4))).toBe('NOT_FIELD');
    expect(code(() => toVerifierCalldata(proof, ['1', '2', '3', '0x1'], 4))).toBe('NOT_FIELD');
    expect(code(() => toVerifierCalldata({ ...proof, pi_a: ['1'] }, ['1', '2', '3', '4'], 4))).toBe(
      'BAD_PROOF_SHAPE',
    );
    expect(code(() => toVerifierCalldata({ ...proof, pi_b: [] }, ['1', '2', '3', '4'], 4))).toBe(
      'BAD_PROOF_SHAPE',
    );
  });
});

describe('properties', () => {
  it('field and range guards agree with bounds', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: VALUE_LIMIT - 1n }),
        fc.bigInt({ min: 0n, max: VALUE_LIMIT - 1n }),
        (v, w) => {
          const args = {
            chainId: 31337,
            note: { ...note, value: v },
            statePath: setup().path,
            withdrawnValue: w,
            newNullifier: 33n,
            newSecret: 44n,
            context: 1n,
          };
          if (w > v) expect(code(() => buildWithdrawInputs(args))).toBe('OUT_OF_RANGE');
          else expect(buildWithdrawInputs(args).existingValue).toBe(v.toString());
        },
      ),
      { numRuns: 200 },
    );
  });
});
