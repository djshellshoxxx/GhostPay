import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite';
import { assertField } from './constants.js';

/**
 * `Poseidon([nullifier])`: the public nullifier hash.
 *
 * @security Input is a secret; never log it. Output is public once spent.
 */
export function nullifierHash(nullifier: bigint): bigint {
  assertField(nullifier, 'nullifier');
  return poseidon1([nullifier]);
}

/**
 * `Poseidon([nullifier, secret])`: the deposit precommitment.
 *
 * @security Inputs are secrets; never log them.
 */
export function precommitment(nullifier: bigint, secret: bigint): bigint {
  assertField(nullifier, 'nullifier');
  assertField(secret, 'secret');
  return poseidon2([nullifier, secret]);
}

/** `Poseidon([value, label, precommitment])`: a state-tree leaf. */
export function commitment(value: bigint, label: bigint, pre: bigint): bigint {
  assertField(value, 'value');
  assertField(label, 'label');
  assertField(pre, 'precommitment');
  return poseidon3([value, label, pre]);
}

/** LeanIMT internal node `Poseidon([left, right])`. */
export function hashNode(left: bigint, right: bigint): bigint {
  assertField(left, 'left');
  assertField(right, 'right');
  return poseidon2([left, right]);
}
