import { fail } from './errors.js';

/** BN254 scalar field modulus `P` (the snarkjs verifier's `r`). */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Maximum LeanIMT depth compiled into `Withdraw(32)`. */
export const MAX_TREE_DEPTH = 32;

/** Upper bound (exclusive) for note values: values are range-checked to 128 bits. */
export const VALUE_LIMIT = 1n << 128n;

/** Withdraw public signals in snarkjs `publicSignals` order (INTERFACE.md section 2). */
export const WITHDRAW_PUBLIC_SIGNALS = [
  'newCommitmentHash',
  'existingNullifierHash',
  'withdrawnValue',
  'stateRoot',
  'stateTreeDepth',
  'aspEnabled',
  'ASPRoot',
  'ASPTreeDepth',
  'context',
] as const;

/** Ragequit (commitment) public signals in snarkjs order (INTERFACE.md section 3). */
export const RAGEQUIT_PUBLIC_SIGNALS = ['commitment', 'nullifierHash', 'value', 'label'] as const;

/** Chain ids this testnet PoC accepts: local anvil, Ethereum Sepolia, Base Sepolia. */
export const TESTNET_CHAIN_IDS: readonly number[] = [31337, 11155111, 84532];

/**
 * Refuses every chain id that is not a supported testnet.
 *
 * @security Keys from the INSECURE DEV CEREMONY are forgeable; nothing built with them may touch a mainnet.
 * @throws PoolCircuitError `WRONG_CHAIN`.
 */
export function assertTestnetChain(chainId: number): void {
  if (!TESTNET_CHAIN_IDS.includes(chainId))
    fail('WRONG_CHAIN', `chain ${String(chainId)} is not a supported testnet`);
}

/**
 * Asserts `x` is a canonical field element `0 <= x < P`.
 *
 * @security Non-canonical values (`x + P`) would alias in the circuit; reject them before witness generation.
 * @throws PoolCircuitError `NOT_FIELD`.
 */
export function assertField(x: bigint, name: string): void {
  if (typeof x !== 'bigint' || x < 0n || x >= SNARK_SCALAR_FIELD)
    fail('NOT_FIELD', `${name} is not a field element`);
}

/**
 * Asserts `0 <= x < 2^128`.
 *
 * @throws PoolCircuitError `OUT_OF_RANGE`.
 */
export function assertValue(x: bigint, name: string): void {
  if (typeof x !== 'bigint' || x < 0n || x >= VALUE_LIMIT)
    fail('OUT_OF_RANGE', `${name} must be in [0, 2^128)`);
}
