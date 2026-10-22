import { SNARK_SCALAR_FIELD } from './constants.js';
import { fail } from './errors.js';

/** snarkjs Groth16 proof JSON (bn128). */
export interface SnarkjsProof {
  readonly pi_a: readonly string[];
  readonly pi_b: readonly (readonly string[])[];
  readonly pi_c: readonly string[];
}

/** Arguments of `verifyProof(uint256[2], uint256[2][2], uint256[2], uint256[N])`, decimal strings. */
export interface VerifierCalldata {
  readonly pA: readonly [string, string];
  readonly pB: readonly [readonly [string, string], readonly [string, string]];
  readonly pC: readonly [string, string];
  readonly pubSignals: readonly string[];
}

function at(arr: readonly string[] | undefined, i: number): string {
  const v = arr?.[i];
  if (v === undefined || !/^[0-9]+$/.test(v))
    fail('BAD_PROOF_SHAPE', 'proof coordinate missing or not decimal');
  return v;
}

/**
 * Converts a snarkjs proof to verifier calldata. G2 coordinates are swapped (`[x1, x0]`), exactly as
 * `snarkjs zkey export soliditycalldata`.
 *
 * @security Public signals are checked to be canonical (`< P`); the Solidity verifier would return false anyway.
 * @throws PoolCircuitError `BAD_PROOF_SHAPE`, `NOT_FIELD`.
 */
export function toVerifierCalldata(
  proof: SnarkjsProof,
  publicSignals: readonly string[],
  expected: number,
): VerifierCalldata {
  if (publicSignals.length !== expected)
    fail('BAD_PROOF_SHAPE', `expected ${String(expected)} public signals`);
  for (const s of publicSignals) {
    if (!/^[0-9]+$/.test(s) || BigInt(s) >= SNARK_SCALAR_FIELD)
      fail('NOT_FIELD', 'public signal not canonical');
  }
  const b0 = proof.pi_b[0];
  const b1 = proof.pi_b[1];
  return {
    pA: [at(proof.pi_a, 0), at(proof.pi_a, 1)],
    pB: [
      [at(b0, 1), at(b0, 0)],
      [at(b1, 1), at(b1, 0)],
    ],
    pC: [at(proof.pi_c, 0), at(proof.pi_c, 1)],
    pubSignals: [...publicSignals],
  };
}
