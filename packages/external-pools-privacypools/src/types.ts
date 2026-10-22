import type { Hex } from 'viem';

/** Groth16 proof in snarkjs JSON layout (`pi_a`, `pi_b`, `pi_c` as decimal strings, projective coordinates). */
export interface Groth16Json {
  readonly pi_a: readonly string[];
  readonly pi_b: readonly (readonly string[])[];
  readonly pi_c: readonly string[];
}

/** A proof plus its public signals (decimal strings), as produced by the SDK and sent to the relayer. */
export interface ProofBundle {
  readonly proof: Groth16Json;
  readonly publicSignals: readonly string[];
}

/** Secret material of one commitment. Lives only inside the encrypted vault. */
export interface CommitmentSecrets {
  readonly value: bigint;
  readonly label: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
}

export interface WithdrawProofInput extends CommitmentSecrets {
  /** `calculateContext(withdrawal, scope)`. */
  readonly context: bigint;
  /** Full note value in the PoC (partial withdrawals are non-goal G1). */
  readonly withdrawalAmount: bigint;
  readonly stateLeaves: readonly bigint[];
  readonly aspLeaves: readonly bigint[];
  readonly newNullifier: bigint;
  readonly newSecret: bigint;
}

/**
 * Cryptographic operations the adapter needs from the Privacy Pools SDK. The adapter never imports the SDK
 * itself: the real implementation (`createSdkCrypto`, `createSdkProver`) is loaded lazily by the application (EP-SUP-2),
 * and tests inject deterministic fakes.
 *
 * @security `entropy` is 16 bytes derived from the root seed with HKDF (EP-PP-10). Implementations MUST NOT keep it
 *   beyond the call and MUST NOT log it.
 */
export interface PrivacyPoolsCrypto {
  depositSecrets(entropy: Uint8Array, scope: bigint, index: bigint): { nullifier: bigint; secret: bigint; precommitment: bigint };
  withdrawalSecrets(entropy: Uint8Array, label: bigint, index: bigint): { nullifier: bigint; secret: bigint };
  /**
   * `hash` is the commitment Poseidon(value, label, Poseidon(nullifier, secret)); `nullifierHash` is the circuit's
   * Poseidon(nullifier), the value the pool emits as `Withdrawn._spentNullifier`. NOTE: the SDK's own `Commitment.nullifierHash`
   * field is the precommitment, not this value (verified in sdk 1.5.0 `getCommitment`).
   */
  commitment(value: bigint, label: bigint, nullifier: bigint, secret: bigint): { hash: bigint; nullifierHash: bigint };
  calculateContext(withdrawal: { processooor: Hex; data: Hex }, scope: bigint): bigint;
  proveWithdrawal(input: WithdrawProofInput): Promise<ProofBundle>;
  verifyWithdrawal(p: ProofBundle): Promise<boolean>;
  proveRagequit(input: CommitmentSecrets): Promise<ProofBundle>;
  /** SHA-256 hex of each circuit artifact actually loaded, keyed `commitment.wasm`, `withdraw.zkey`, ... */
  artifactDigests(): Promise<Readonly<Record<string, string>>>;
}

/** Association set published by the ASP for one pool scope. The adapter checks its root against `Entrypoint.latestRoot()`. */
export interface AspSet {
  readonly leaves: readonly bigint[];
}

/**
 * ASP data source. The official endpoint and format are not documented in the sources read for this package
 * [UNVERIFIED, spec open question Q3], so the application supplies an implementation; the adapter trusts nothing
 * from it that it cannot compare with chain state.
 */
export interface AspSource {
  getAssociationSet(chainId: number, scope: bigint): Promise<AspSet>;
}

/** Decoded `PoolNote.adapterData` for Privacy Pools (version 1). Secret-bearing. */
export interface PpNoteData {
  readonly v: 1;
  readonly entrypoint: Hex;
  readonly pool: Hex;
  readonly scope: bigint;
  readonly label: bigint;
  readonly value: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
  readonly commitment: bigint;
  readonly nullifierHash: bigint;
  readonly index: number;
  /** Secrets for the (single) full withdrawal, derived at entry from the withdrawal index 0. */
  readonly newNullifier: bigint;
  readonly newSecret: bigint;
}
