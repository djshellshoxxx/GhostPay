/**
 * `@ghostpay/pool-circuits`: helpers that mirror the circom circuits (hashes, LeanIMT path layout, witness
 * JSON, verifier calldata). The circuits themselves live in `circuits/`; see INTERFACE.md.
 *
 * INSECURE DEV CEREMONY: verifiers and keys built by this package are forgeable. Testnet only.
 */
export { PoolCircuitError } from './errors.js';
export type { PoolCircuitErrorCode } from './errors.js';
export {
  SNARK_SCALAR_FIELD,
  MAX_TREE_DEPTH,
  VALUE_LIMIT,
  WITHDRAW_PUBLIC_SIGNALS,
  RAGEQUIT_PUBLIC_SIGNALS,
  TESTNET_CHAIN_IDS,
  assertTestnetChain,
  assertField,
  assertValue,
} from './constants.js';
export { nullifierHash, precommitment, commitment, hashNode } from './hash.js';
export { LeanImt } from './leanImt.js';
export type { CircuitPath } from './leanImt.js';
export { buildWithdrawInputs, buildRagequitInputs } from './inputs.js';
export type { WithdrawInputs, RagequitInputs, CircuitNote, WithdrawArgs } from './inputs.js';
export { toVerifierCalldata } from './calldata.js';
export type { SnarkjsProof, VerifierCalldata } from './calldata.js';
