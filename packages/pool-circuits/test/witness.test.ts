/**
 * Constraint-level tests via the circom witness generator (the wasm checks every `===` while computing).
 * SP-CIR-2 / SP-CIR-3: each negative case breaks exactly one rule of a valid witness.
 */
import { describe, expect, it } from 'vitest';
import {
  SNARK_SCALAR_FIELD as P,
  VALUE_LIMIT,
  commitment,
  nullifierHash,
  precommitment,
} from '../src/index.js';
import { join } from 'node:path';
import { HAVE_WASM, PKG, SKIP_NOTE, art, loadJson, rejects, witness } from './circuit.testutil.js';
import { rf, scenario } from './scenario.testutil.js';
import type { WithdrawInputs } from '../src/index.js';

if (!HAVE_WASM) console.warn(SKIP_NOTE);

type Mut = Record<string, unknown>;
const W = (i: WithdrawInputs, m: Mut = {}): object => ({ ...i, ...m });
const setAt = (arr: readonly string[], k: number, v: string): string[] =>
  arr.map((x, i) => (i === k ? v : x));

describe.skipIf(!HAVE_WASM)('ragequit circuit vs poseidon-lite (SP-SDK-3)', () => {
  it('1000 random vectors: outputs equal TS hashes; public signal order [commitment, nullifierHash, value, label]', async () => {
    for (let k = 0; k < 1000; k++) {
      const value = k % 7 === 0 ? VALUE_LIMIT - 1n : BigInt(k);
      const label = rf();
      const nullifier = rf();
      const secret = rf();
      const w = await witness(art.ragequitWasm, { value, label, nullifier, secret });
      expect(w[0]).toBe(1n);
      expect(w[1]).toBe(commitment(value, label, precommitment(nullifier, secret)));
      expect(w[2]).toBe(nullifierHash(nullifier));
      expect(w[3]).toBe(value);
      expect(w[4]).toBe(label);
    }
  });
});

describe.skipIf(!HAVE_WASM)('withdraw circuit: valid witnesses', () => {
  const cases: [string, Parameters<typeof scenario>[0]][] = [
    ['partial, aspEnabled=0, depth 3 real tree', { stateSize: 5 }],
    ['full withdrawal (change 0)', { withdrawnValue: 1_000_000n }],
    ['aspEnabled=1, ASP depth 2', { asp: true, aspSize: 3 }],
    ['aspEnabled=1, ASP of size 1 (depth 0, root = label)', { asp: true, aspSize: 1 }],
    ['state size 1 (depth 0, root = leaf)', { stateSize: 1, position: 0 }],
    ['state depth 1', { stateSize: 2, position: 1 }],
    ['state depth 2, right-most propagated leaf', { stateSize: 3, position: 2 }],
    ['state depth 20 synthetic', { stateDepth: 20 }],
    ['state depth 32 synthetic', { stateDepth: 32 }],
    ['max values 2^128-1', { value: VALUE_LIMIT - 1n, withdrawnValue: VALUE_LIMIT - 1n }],
    ['zero withdrawal (circuit allows; contract rejects)', { withdrawnValue: 0n }],
  ];
  for (const [name, opts] of cases) {
    it(name, async () => {
      const s = scenario(opts);
      const w = await witness(art.withdrawWasm, s.input);
      // INTERFACE.md section 2 order
      expect(w.slice(1, 10)).toEqual([
        s.expect.newCommitmentHash,
        s.expect.existingNullifierHash,
        BigInt(s.input.withdrawnValue),
        BigInt(s.input.stateRoot),
        BigInt(s.input.stateTreeDepth),
        BigInt(s.input.aspEnabled),
        BigInt(s.input.ASPRoot),
        BigInt(s.input.ASPTreeDepth),
        BigInt(s.input.context),
      ]);
    });
  }

  it('double spend: two different withdrawals of one note reveal the same nullifier hash; ragequit too', async () => {
    const a = scenario();
    const b2 = {
      ...a.input,
      newNullifier: rf().toString(),
      newSecret: rf().toString(),
      withdrawnValue: '1',
      context: rf().toString(),
    };
    const wa = await witness(art.withdrawWasm, a.input);
    const wb = await witness(art.withdrawWasm, b2);
    expect(wb[2]).toBe(wa[2]);
    expect(wb[1]).not.toBe(wa[1]);
    const r = await witness(art.ragequitWasm, {
      value: a.note.value,
      label: a.note.label,
      nullifier: a.note.nullifier,
      secret: a.note.secret,
    });
    expect(r[2]).toBe(wa[2]);
  });

  it('stateTreeDepth may exceed the real depth when the extra siblings are 0 (informational only)', async () => {
    const s = scenario({ stateSize: 5 });
    await expect(witness(art.withdrawWasm, W(s.input, { stateTreeDepth: '32' }))).resolves.toBeDefined();
  });
});

describe.skipIf(!HAVE_WASM)('withdraw circuit: adversarial witnesses fail (one rule broken each)', () => {
  const s = scenario({ asp: true, stateSize: 6, position: 3 });
  const s0 = scenario({ stateSize: 6, position: 3 });
  const neg: [string, () => object][] = [
    ['wrong stateRoot', () => W(s.input, { stateRoot: rf().toString() })],
    ['wrong existingSecret', () => W(s.input, { existingSecret: rf().toString() })],
    ['wrong existingNullifier', () => W(s.input, { existingNullifier: rf().toString() })],
    ['wrong label (commitment mismatch)', () => W(s.input, { label: rf().toString() })],
    [
      'wrong existingValue',
      () => W(s.input, { existingValue: (BigInt(s.input.existingValue) + 1n).toString() }),
    ],
    ['wrong stateIndex', () => W(s.input, { stateIndex: (Number(s.input.stateIndex) ^ 1).toString() })],
    [
      'wrong state sibling',
      () => W(s.input, { stateSiblings: setAt(s.input.stateSiblings, 1, rf().toString()) }),
    ],
    [
      'sibling above stateTreeDepth',
      () => W(s.input, { stateSiblings: setAt(s.input.stateSiblings, 10, '5') }),
    ],
    [
      'index bit set where sibling empty',
      () => W(s0.input, { stateIndex: (Number(s0.input.stateIndex) + 2 ** 20).toString() }),
    ],
    [
      'stateIndex >= 2^32',
      () => W(s.input, { stateIndex: (2n ** 32n + BigInt(s.input.stateIndex)).toString() }),
    ],
    ['stateTreeDepth = 33', () => W(s.input, { stateTreeDepth: '33' })],
    [
      'stateTreeDepth = P - 1 (0xbow LessEqThan wrap)',
      () => W(s.input, { stateTreeDepth: (P - 1n).toString() }),
    ],
    ['stateTreeDepth = 64', () => W(s.input, { stateTreeDepth: '64' })],
    [
      'wrong ASP sibling with aspEnabled=1',
      () => W(s.input, { ASPSiblings: setAt(s.input.ASPSiblings, 0, rf().toString()) }),
    ],
    ['wrong ASPRoot with aspEnabled=1', () => W(s.input, { ASPRoot: rf().toString() })],
    [
      'label not in ASP set',
      () => {
        const other = scenario({ asp: true });
        return W(s.input, {
          ASPRoot: other.input.ASPRoot,
          ASPSiblings: other.input.ASPSiblings,
          ASPIndex: other.input.ASPIndex,
          ASPTreeDepth: other.input.ASPTreeDepth,
        });
      },
    ],
    ['aspEnabled = 2', () => W(s.input, { aspEnabled: '2' })],
    ['aspEnabled = P - 1', () => W(s.input, { aspEnabled: (P - 1n).toString() })],
    ['aspEnabled = 0 with non-zero ASPRoot', () => W(s0.input, { ASPRoot: rf().toString() })],
    [
      'aspEnabled = 0 with non-zero ASPTreeDepth',
      () => W(s0.input, { ASPTreeDepth: '1', ASPSiblings: setAt(s0.input.ASPSiblings, 0, '0') }),
    ],
    [
      'aspEnabled = 0 with non-zero ASP sibling',
      () => W(s0.input, { ASPSiblings: setAt(s0.input.ASPSiblings, 0, '9') }),
    ],
    [
      'withdrawnValue > existingValue (field wrap of remainder)',
      () => W(s.input, { withdrawnValue: (BigInt(s.input.existingValue) + 1n).toString() }),
    ],
    ['withdrawnValue = 2^128', () => W(s.input, { withdrawnValue: VALUE_LIMIT.toString() })],
    ['withdrawnValue = P - 1 (negative)', () => W(s.input, { withdrawnValue: (P - 1n).toString() })],
    ['existingNullifier == newNullifier', () => W(s.input, { newNullifier: s.input.existingNullifier })],
  ];
  for (const [name, mk] of neg) {
    it(name, async () => {
      expect(await rejects(art.withdrawWasm, mk())).toBe(true);
    });
  }

  it('aspEnabled = 2 with label 0 (only the boolean constraint can catch it)', async () => {
    // With D-1, a non-boolean aspEnabled forces ASPRoot = 0, depth 0, hence label = 0. Build exactly that note.
    const { LeanImt } = await import('../src/index.js');
    const base = scenario({ value: 10n, withdrawnValue: 1n });
    const leaf = commitment(
      10n,
      0n,
      precommitment(BigInt(base.input.existingNullifier), BigInt(base.input.existingSecret)),
    );
    const t = new LeanImt();
    t.insert(leaf);
    const p = t.path(0);
    const input = {
      ...base.input,
      label: '0',
      stateRoot: p.root.toString(),
      stateTreeDepth: '0',
      stateSiblings: p.siblings.map(String),
      stateIndex: '0',
    };
    expect(await rejects(art.withdrawWasm, input)).toBe(false); // control: aspEnabled = 0 is fine
    expect(await rejects(art.withdrawWasm, { ...input, aspEnabled: '2' })).toBe(true);
  });

  it('existingValue >= 2^128 is rejected even if the note were in the tree (D-3)', async () => {
    // Build a tree containing a note with value 2^128 (unreachable via the contract, but the circuit must still refuse).
    const big = scenario({ value: 1n, withdrawnValue: 0n });
    const forged = { ...big.input, existingValue: VALUE_LIMIT.toString(), withdrawnValue: '1' };
    // Root mismatch would also fail; recompute a consistent tree so only the range check can fail.
    const { LeanImt } = await import('../src/index.js');
    const leaf = commitment(
      VALUE_LIMIT,
      BigInt(big.input.label),
      precommitment(BigInt(big.input.existingNullifier), BigInt(big.input.existingSecret)),
    );
    const t = new LeanImt();
    t.insert(leaf);
    t.insert(rf());
    const p = t.path(0);
    const input = {
      ...forged,
      stateRoot: p.root.toString(),
      stateTreeDepth: String(p.depth),
      stateSiblings: p.siblings.map(String),
      stateIndex: '0',
    };
    expect(await rejects(art.withdrawWasm, input)).toBe(true);
    // control: the same tree with value 2^128 - 1 is accepted
    const leafOk = commitment(
      VALUE_LIMIT - 1n,
      BigInt(big.input.label),
      precommitment(BigInt(big.input.existingNullifier), BigInt(big.input.existingSecret)),
    );
    const t2 = new LeanImt();
    t2.insert(leafOk);
    t2.insert(rf());
    const p2 = t2.path(0);
    const ok = {
      ...forged,
      existingValue: (VALUE_LIMIT - 1n).toString(),
      stateRoot: p2.root.toString(),
      stateTreeDepth: String(p2.depth),
      stateSiblings: p2.siblings.map(String),
      stateIndex: '0',
    };
    expect(await rejects(art.withdrawWasm, ok)).toBe(false);
  });
});

describe.skipIf(!HAVE_WASM)('test-vectors/shielded-pool.json reproduce in the circuit', () => {
  it('withdrawExample and ragequitExample public signals equal the witness', async () => {
    const v = loadJson<{
      withdrawExample: { input: object; publicSignals: string[] };
      ragequitExample: { input: object; publicSignals: string[] };
    }>(join(PKG, '../../test-vectors/shielded-pool.json'));
    const w = await witness(art.withdrawWasm, v.withdrawExample.input);
    expect(w.slice(1, 10).map(String)).toEqual(v.withdrawExample.publicSignals);
    const r = await witness(art.ragequitWasm, v.ragequitExample.input);
    expect(r.slice(1, 5).map(String)).toEqual(v.ragequitExample.publicSignals);
  });
});
