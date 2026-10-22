import { fail } from './errors.js';

/** bn254 scalar field modulus `P` (circom / snarkjs). */
export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Maximum note value: `2**128 - 1` (circuit range check `Num2Bits(128)`). */
export const MAX_VALUE = (1n << 128n) - 1n;

/** Maximum Merkle depth supported by the circuit. */
export const MAX_TREE_DEPTH = 32;

/** Returns true if `x` is an integer in `[0, P)`. */
export function inField(x: bigint): boolean {
  return x >= 0n && x < SNARK_SCALAR_FIELD;
}

/** @throws PoolSdkError `INVALID_INPUT` unless `x` is in `[0, P)`. */
export function assertField(x: bigint, name: string): void {
  if (typeof x !== 'bigint' || !inField(x)) fail('INVALID_INPUT', `${name} is not a field element`);
}

/** @throws PoolSdkError `INVALID_INPUT` unless `0 < v <= MAX_VALUE`. */
export function assertValue(v: bigint, name: string): void {
  if (typeof v !== 'bigint' || v <= 0n || v > MAX_VALUE) fail('INVALID_INPUT', `${name} out of range`);
}

/** Big-endian bytes to bigint. */
export function os2ip(bytes: Uint8Array): bigint {
  let r = 0n;
  for (const b of bytes) r = (r << 8n) | BigInt(b);
  return r;
}
