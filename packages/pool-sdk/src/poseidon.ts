import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import { fail } from './errors.js';

let verified = false;

/** Runs the known-answer check once, on first use (SP-SDK-3: a mismatch throws instead of producing unprovable notes). */
function ensure(): void {
  if (verified) return;
  const v = POSEIDON_VECTORS;
  if (poseidon1(v.t2.in) !== v.t2.out || poseidon2(v.t3.in) !== v.t3.out || poseidon3(v.t4.in) !== v.t4.out) {
    fail('VECTOR_MISMATCH', 'poseidon implementation does not match circomlib vectors');
  }
  verified = true;
}

/** Poseidon over bn254, 1 input (`nullifierHash`). */
export function poseidonT2(a: bigint): bigint {
  ensure();
  return poseidon1([a]);
}

/** Poseidon over bn254, 2 inputs (`precommitment`, Merkle node). */
export function poseidonT3(a: bigint, b: bigint): bigint {
  ensure();
  return poseidon2([a, b]);
}

/** Poseidon over bn254, 3 inputs (`commitment`). */
export function poseidonT4(a: bigint, b: bigint, c: bigint): bigint {
  ensure();
  return poseidon3([a, b, c]);
}

/**
 * Committed circomlib reference vectors (circomlib `poseidon_test.js`; also in
 * `test-vectors/shielded-pool.json` once the circuits agent publishes it).
 */
export const POSEIDON_VECTORS = Object.freeze({
  t2: { in: [1n] as [bigint], out: 0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133n },
  t3: { in: [1n, 2n] as [bigint, bigint], out: 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an },
  t4: { in: [1n, 2n, 3n] as [bigint, bigint, bigint], out: 0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732n },
});

/**
 * Checks the Poseidon implementation against the committed vectors (SP-SDK-3).
 *
 * @throws PoolSdkError `VECTOR_MISMATCH` on any difference.
 * @security A mismatch would make every note unprovable; fail at load instead of at proof time.
 */
export function assertPoseidonVectors(): void {
  verified = false;
  ensure();
}
