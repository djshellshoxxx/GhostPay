import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { poseidonPerm } from '@zk-kit/poseidon-cipher';
import { fail } from '@ghostpay/external-pools';
import type { Hex } from 'viem';
import type { CommitmentSecrets, PrivacyPoolsCrypto, ProofBundle, WithdrawProofInput } from './types.js';

/** Circuits the adapter needs. `merkleTree` is not used by the SDK flows in this package. */
export type CircuitKind = 'commitment' | 'withdraw';
export type ArtifactKind = 'wasm' | 'zkey' | 'vkey';

/**
 * Supplies circuit artifact bytes. The application decides where they come from (local files, or a fetch through
 * the network-privacy transport); this package never downloads them itself. Digests are computed over the bytes
 * actually handed to the SDK, so the manifest check (EP-PP-6) does not depend on the SDK's own digest list.
 */
export type ArtifactProvider = (circuit: CircuitKind, kind: ArtifactKind) => Promise<Uint8Array>;

const MAX_DEPTH = 32;

/** Depth of a lean incremental Merkle tree with `n` leaves: `ceil(log2 n)` (0 for one leaf). */
export function treeDepth(n: number): bigint {
  let d = 0n;
  for (let size = 1; size < n; size *= 2) d += 1n;
  return d;
}

/** @returns Poseidon over one input, as circomlib's `Poseidon(1)` (the circuit's nullifier hash). */
export function poseidon1(x: bigint): bigint {
  const out = poseidonPerm([0n, x])[0];
  if (out === undefined) return fail('INVALID_INPUT', 'poseidon returned no output');
  return out;
}

/**
 * Real {@link PrivacyPoolsCrypto} backed by `@0xbow/privacy-pools-core-sdk` 1.5.0, loaded with a dynamic `import()`
 * (EP-SUP-2). Key material: 16 bytes of HKDF output become a BIP-39 mnemonic (`@scure/bip39`), which the SDK turns into
 * master keys; the mnemonic is separate from any wallet mnemonic.
 *
 * @param artifacts Circuit artifact bytes.
 * @security Artifact bytes are hashed (SHA-256) as they are loaded; {@link PrivacyPoolsCrypto.artifactDigests} reports
 *   those hashes so the adapter can compare them with the pinned manifest before any proof is made.
 */
export async function createSdkCrypto(artifacts: ArtifactProvider): Promise<PrivacyPoolsCrypto> {
  const sdk = await import('@0xbow/privacy-pools-core-sdk');
  const { entropyToMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english');
  const digests: Record<string, string> = {};
  const cache = new Map<string, Uint8Array>();

  const load = async (circuit: CircuitKind, kind: ArtifactKind): Promise<Uint8Array> => {
    const key = `${circuit}.${kind}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const bytes = await artifacts(circuit, kind);
    digests[key] = bytesToHex(sha256(bytes));
    cache.set(key, bytes);
    return bytes;
  };
  const circuitName = (n: string): CircuitKind => {
    if (n !== 'commitment' && n !== 'withdraw') return fail('INVALID_INPUT', `unsupported circuit ${n}`);
    return n;
  };
  const circuits = {
    getWasm: (n: string) => load(circuitName(n), 'wasm'),
    getProvingKey: (n: string) => load(circuitName(n), 'zkey'),
    getVerificationKey: (n: string) => load(circuitName(n), 'vkey'),
  };
  const psdk = new sdk.PrivacyPoolSDK(circuits);
  const keysFor = (entropy: Uint8Array): ReturnType<typeof sdk.generateMasterKeys> => sdk.generateMasterKeys(entropyToMnemonic(entropy, wordlist));
  const hash = (v: bigint): ReturnType<typeof sdk.bigintToHash> => sdk.bigintToHash(v);

  const toBundle = (p: { proof: { pi_a: unknown; pi_b: unknown; pi_c: unknown }; publicSignals: unknown }): ProofBundle => ({
    proof: { pi_a: p.proof.pi_a as string[], pi_b: p.proof.pi_b as string[][], pi_c: p.proof.pi_c as string[] },
    publicSignals: (p.publicSignals as (string | bigint)[]).map(String),
  });
  const pad = (s: readonly bigint[]): bigint[] => [...s, ...new Array<bigint>(MAX_DEPTH - s.length).fill(0n)];

  return {
    depositSecrets(entropy, scope, index) {
      const s = sdk.generateDepositSecrets(keysFor(entropy), hash(scope), index);
      return { nullifier: s.nullifier, secret: s.secret, precommitment: sdk.hashPrecommitment(s.nullifier, s.secret) };
    },
    withdrawalSecrets(entropy, label, index) {
      const s = sdk.generateWithdrawalSecrets(keysFor(entropy), hash(label), index);
      return { nullifier: s.nullifier, secret: s.secret };
    },
    commitment(value, label, nullifier, secret) {
      const c = sdk.getCommitment(value, label, nullifier as never, secret as never);
      return { hash: c.hash, nullifierHash: poseidon1(nullifier) };
    },
    calculateContext(withdrawal: { processooor: Hex; data: Hex }, scope) {
      return BigInt(sdk.calculateContext(withdrawal, hash(scope)));
    },
    async proveWithdrawal(i: WithdrawProofInput) {
      const c = sdk.getCommitment(i.value, i.label, i.nullifier as never, i.secret as never);
      const stateProof = sdk.generateMerkleProof([...i.stateLeaves], c.hash);
      const aspProof = sdk.generateMerkleProof([...i.aspLeaves], i.label);
      const state = { ...stateProof, siblings: pad(stateProof.siblings) };
      const asp = { ...aspProof, siblings: pad(aspProof.siblings) };
      const out = await psdk.proveWithdrawal(c, {
        context: i.context,
        withdrawalAmount: i.withdrawalAmount,
        stateMerkleProof: state,
        aspMerkleProof: asp,
        stateRoot: hash(BigInt(stateProof.root)),
        stateTreeDepth: treeDepth(i.stateLeaves.length),
        aspRoot: hash(BigInt(aspProof.root)),
        aspTreeDepth: treeDepth(i.aspLeaves.length),
        newSecret: i.newSecret as never,
        newNullifier: i.newNullifier as never,
      });
      return toBundle(out);
    },
    async verifyWithdrawal(p) {
      return psdk.verifyWithdrawal({ proof: p.proof, publicSignals: [...p.publicSignals] } as never);
    },
    async proveRagequit(i: CommitmentSecrets) {
      return toBundle(await psdk.proveCommitment(i.value, i.label, i.nullifier, i.secret));
    },
    async artifactDigests() {
      for (const c of ['commitment', 'withdraw'] as const) for (const k of ['wasm', 'zkey', 'vkey'] as const) await load(c, k);
      return { ...digests };
    },
  };
}
