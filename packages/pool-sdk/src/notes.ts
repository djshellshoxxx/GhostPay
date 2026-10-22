import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getAddress, type Address } from 'viem';
import { assertPoolChain } from './chain.js';
import { fail } from './errors.js';
import { SNARK_SCALAR_FIELD, assertField, os2ip } from './field.js';
import { poseidonT2, poseidonT3, poseidonT4 } from './poseidon.js';

/** Runs `f` with the secret seed bytes, e.g. `(f) => secretBox.use(f)`. The seed never escapes `f`. */
export type WithSeed = <T>(f: (seed: Uint8Array) => T) => T;

/** A pool note. Contains secrets: never log, serialise or send it anywhere. */
export interface Note {
  readonly chainId: number;
  readonly pool: Address;
  /** Derivation index (see {@link deriveNoteSecrets}). */
  readonly index: number;
  readonly value: bigint;
  readonly label: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
  /** Leaf index of the note's commitment in the pool tree, once known. */
  readonly leafIndex?: number;
  readonly spent?: boolean;
}

/** Nullifier/secret pair of a note. */
export interface NoteSecrets {
  readonly nullifier: bigint;
  readonly secret: bigint;
}

const SALT = new TextEncoder().encode('ghostpay/shielded-pool/v1');
const enc = new TextEncoder();

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function expandScalar(poolSeed: Uint8Array, tag: string, index: number): bigint {
  for (let ctr = 0; ctr < 256; ctr++) {
    const info = new Uint8Array([...enc.encode(tag), ...u32be(index), ...(ctr === 0 ? [] : [ctr])]);
    const out = hkdf(sha256, poolSeed, new Uint8Array(0), info, 64);
    const v = os2ip(out) % SNARK_SCALAR_FIELD;
    if (v !== 0n) return v;
  }
  /* c8 ignore next */
  return fail('INVALID_INPUT', 'scalar derivation exhausted');
}

/**
 * Derives the note nullifier and secret deterministically from the seed (SP-SDK-1).
 *
 * `poolSeed = HKDF-SHA256(ikm=seed, salt="ghostpay/shielded-pool/v1", info=u32be(chainId)||pool, 32)`;
 * `nullifier = OS2IP(HKDF-Expand(poolSeed, "n"||u32be(index), 64)) mod P`, `secret` likewise with `"s"`;
 * a zero result retries with a counter byte appended.
 *
 * @param withSeed Scoped seed accessor (SP-SDK-2: the seed only exists inside the callback).
 * @param chainId Testnet chain id.
 * @param pool Pool contract address.
 * @param index Non-negative integer note index.
 * @throws PoolSdkError `WRONG_CHAIN`, `INVALID_INPUT`.
 * @security Output is spending authority over the note. Keep out of logs and network payloads.
 */
export function deriveNoteSecrets(withSeed: WithSeed, chainId: number, pool: Address, index: number): NoteSecrets {
  assertPoolChain(chainId);
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) fail('INVALID_INPUT', 'index out of range');
  const poolBytes = hexToBytes20(pool);
  return withSeed((seed) => {
    if (seed.length < 16) fail('INVALID_INPUT', 'seed too short');
    const poolSeed = hkdf(sha256, seed, SALT, new Uint8Array([...u32be(chainId), ...poolBytes]), 32);
    try {
      return { nullifier: expandScalar(poolSeed, 'n', index), secret: expandScalar(poolSeed, 's', index) };
    } finally {
      poolSeed.fill(0);
    }
  });
}

function hexToBytes20(a: Address): Uint8Array {
  const h = getAddress(a).slice(2);
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** `Poseidon(nullifier, secret)`: the value passed to `deposit`. */
export function precommitment(n: NoteSecrets): bigint {
  assertField(n.nullifier, 'nullifier');
  assertField(n.secret, 'secret');
  return poseidonT3(n.nullifier, n.secret);
}

/** `Poseidon(value, label, precommitment)`: the Merkle leaf. */
export function commitment(value: bigint, label: bigint, pre: bigint): bigint {
  assertField(value, 'value');
  assertField(label, 'label');
  assertField(pre, 'precommitment');
  return poseidonT4(value, label, pre);
}

/** `Poseidon(nullifier)`: the public spend marker. */
export function nullifierHash(nullifier: bigint): bigint {
  assertField(nullifier, 'nullifier');
  return poseidonT2(nullifier);
}

/** Commitment of a full note. */
export function noteCommitment(n: Pick<Note, 'value' | 'label' | 'nullifier' | 'secret'>): bigint {
  return commitment(n.value, n.label, precommitment(n));
}
