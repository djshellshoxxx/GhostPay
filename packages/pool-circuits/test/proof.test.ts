/**
 * Groth16 proof-level tests (needs build/*.zkey from the INSECURE DEV CEREMONY):
 * valid proofs, public-signal order (SP-CIR-5), tampered public inputs, non-canonical inputs,
 * proof re-randomisation (malleability), cross-circuit confusion, double spend at the nullifier level.
 */
import { randomBytes } from 'node:crypto';
import { buildBn128 } from 'ffjavascript';
import type { Bn128 } from 'ffjavascript';
import * as snarkjs from 'snarkjs';
import type { Groth16Proof } from 'snarkjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SNARK_SCALAR_FIELD as P,
  WITHDRAW_PUBLIC_SIGNALS,
  commitment,
  nullifierHash,
  precommitment,
} from '../src/index.js';
import { HAVE_WASM, HAVE_ZKEY, SKIP_NOTE, art, loadJson } from './circuit.testutil.js';
import { randomNote, rf, scenario } from './scenario.testutil.js';
import type { Scenario } from './scenario.testutil.js';

const RUN = HAVE_WASM && HAVE_ZKEY;
if (!RUN) console.warn(SKIP_NOTE);

const bump = (sig: string[], i: number, by: bigint): string[] =>
  sig.map((x, k) => (k === i ? ((BigInt(x) + by) % P).toString() : x));

/** A' = r*A, B' = r^-1 * B, C' = C: a different proof for the same statement. */
function rerandomise(bn: Bn128, p: Groth16Proof): Groth16Proof {
  const r = (BigInt('0x' + randomBytes(32).toString('hex')) % (P - 1n)) + 1n;
  const fr = bn.Fr.e(r);
  const a = bn.G1.toAffine(bn.G1.timesFr(bn.G1.fromObject(p.pi_a.map(BigInt)), fr));
  const b = bn.G2.toAffine(bn.G2.timesFr(bn.G2.fromObject(p.pi_b.map((c) => c.map(BigInt))), bn.Fr.inv(fr)));
  const ao = bn.G1.toObject(a) as bigint[];
  const bo = bn.G2.toObject(b) as bigint[][];
  return { ...p, pi_a: ao.map(String), pi_b: bo.map((c) => c.map(String)) };
}

describe.skipIf(!RUN)('withdraw Groth16 proofs', () => {
  let vk: unknown;
  let rqVk: unknown;
  let s: Scenario;
  let proof: Groth16Proof;
  let pub: string[];
  let bn: Bn128;

  beforeAll(async () => {
    vk = loadJson(art.withdrawVkey);
    rqVk = loadJson(art.ragequitVkey);
    bn = await buildBn128(true);
    s = scenario({ asp: true, stateSize: 7, position: 4 });
    ({ proof, publicSignals: pub } = await snarkjs.groth16.fullProve(
      { ...s.input },
      art.withdrawWasm,
      art.withdrawZkey,
    ));
  });
  afterAll(async () => {
    await bn.terminate();
  });

  it('verifies, and public signals follow INTERFACE.md order', async () => {
    expect(await snarkjs.groth16.verify(vk, pub, proof)).toBe(true);
    expect(pub).toHaveLength(WITHDRAW_PUBLIC_SIGNALS.length);
    const byName = Object.fromEntries(WITHDRAW_PUBLIC_SIGNALS.map((n, i) => [n, pub[i]]));
    expect(byName).toEqual({
      newCommitmentHash: s.expect.newCommitmentHash.toString(),
      existingNullifierHash: s.expect.existingNullifierHash.toString(),
      withdrawnValue: s.input.withdrawnValue,
      stateRoot: s.input.stateRoot,
      stateTreeDepth: s.input.stateTreeDepth,
      aspEnabled: '1',
      ASPRoot: s.input.ASPRoot,
      ASPTreeDepth: s.input.ASPTreeDepth,
      context: s.input.context,
    });
  });

  for (let i = 0; i < WITHDRAW_PUBLIC_SIGNALS.length; i++) {
    it(`tampered public signal ${String(i)} (${WITHDRAW_PUBLIC_SIGNALS[i] ?? ''}) is rejected`, async () => {
      expect(await snarkjs.groth16.verify(vk, bump(pub, i, 1n), proof)).toBe(false);
    });
  }

  it('changing context (recipient / relayer / fee / announce binding) is rejected', async () => {
    const other = [...pub];
    other[8] = rf().toString();
    expect(await snarkjs.groth16.verify(vk, other, proof)).toBe(false);
  });

  it('non-canonical public signal x + P is rejected by snarkjs JS verify (and by Solidity checkField, foundry test)', async () => {
    for (let k = 0; k < pub.length; k++) {
      const aliased = pub.map((x, m) => (m === k ? (BigInt(x) + P).toString() : x));
      expect(await snarkjs.groth16.verify(vk, aliased, proof)).toBe(false);
    }
  });

  it('re-randomised proof verifies with identical public signals (malleability: replay key must be the nullifier)', async () => {
    const p2 = rerandomise(bn, proof);
    expect(p2.pi_a).not.toEqual(proof.pi_a);
    expect(await snarkjs.groth16.verify(vk, pub, p2)).toBe(true);
  });

  it('a fresh proof of the same witness differs but reveals the same nullifier hash', async () => {
    const again = await snarkjs.groth16.fullProve({ ...s.input }, art.withdrawWasm, art.withdrawZkey);
    expect(again.proof.pi_a).not.toEqual(proof.pi_a);
    expect(again.publicSignals[1]).toBe(pub[1]);
  });

  it('withdraw proof does not verify against the ragequit key (cross-circuit)', async () => {
    let ok: boolean;
    try {
      ok = await snarkjs.groth16.verify(rqVk, pub.slice(0, 4), proof);
    } catch {
      ok = false;
    }
    expect(ok).toBe(false);
  });

  it('aspEnabled=0 proof verifies with zeroed ASP signals', async () => {
    const s0 = scenario({ stateDepth: 20 });
    const r = await snarkjs.groth16.fullProve({ ...s0.input }, art.withdrawWasm, art.withdrawZkey);
    expect(r.publicSignals.slice(5, 8)).toEqual(['0', '0', '0']);
    expect(await snarkjs.groth16.verify(vk, r.publicSignals, r.proof)).toBe(true);
  });
});

describe.skipIf(!RUN)('ragequit Groth16 proofs', () => {
  it('verifies; order [commitment, nullifierHash, value, label]; tampering rejected', async () => {
    const vk = loadJson(art.ragequitVkey);
    const n = randomNote(123_456n);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { value: n.value, label: n.label, nullifier: n.nullifier, secret: n.secret },
      art.ragequitWasm,
      art.ragequitZkey,
    );
    expect(publicSignals).toEqual([
      commitment(n.value, n.label, precommitment(n.nullifier, n.secret)).toString(),
      nullifierHash(n.nullifier).toString(),
      n.value.toString(),
      n.label.toString(),
    ]);
    expect(await snarkjs.groth16.verify(vk, publicSignals, proof)).toBe(true);
    for (let i = 0; i < 4; i++)
      expect(await snarkjs.groth16.verify(vk, bump(publicSignals, i, 1n), proof)).toBe(false);
  });
});
