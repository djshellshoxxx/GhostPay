import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { fail } from './errors.js';
import { decodeAddress, encodeAddress, isOnCurve } from './point.js';

/**
 * SPL Token program id. Verified 2026-10-21 against
 * solana-labs/solana-program-library tag token-v3.4.0, token/program/src/lib.rs line 79.
 */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
/**
 * SPL Token-2022 program id. Verified against tag token-2022-v1.0.0,
 * token/program-2022/src/lib.rs line 98.
 */
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/**
 * SPL Associated Token Account program id. Verified against tag
 * associated-token-account-v1.1.0, associated-token-account/program/src/lib.rs line 19.
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
/** SPL Memo program id (v3). Verified against tag memo-v3.0.0, memo/program/src/lib.rs line 16. */
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/** solana-program `MAX_SEEDS` (sdk/program/src/pubkey.rs v1.18.26 line 22). */
export const MAX_SEEDS = 16;
/** solana-program `MAX_SEED_LEN` (line 20). */
export const MAX_SEED_LEN = 32;
const PDA_MARKER = utf8ToBytes('ProgramDerivedAddress');

/** A program derived address with its bump seed. */
export interface ProgramAddress {
  readonly address: string;
  readonly bump: number;
}

function checkSeeds(seeds: readonly Uint8Array[], maxSeeds: number): void {
  if (!Array.isArray(seeds) || seeds.length > maxSeeds) fail('INVALID_SEEDS');
  for (const s of seeds) if (!(s instanceof Uint8Array) || s.length > MAX_SEED_LEN) fail('INVALID_SEEDS');
}

function programIdBytes(programId: string): Uint8Array {
  return decodeAddress(programId);
}

/** @internal sha256(seeds || program_id || "ProgramDerivedAddress"), or null if on curve. */
function tryCreate(
  seeds: readonly Uint8Array[],
  programId: Uint8Array,
  onCurve: (b: Uint8Array) => boolean,
): Uint8Array | null {
  const hash = sha256(concatBytes(...seeds, programId, PDA_MARKER));
  return onCurve(hash) ? null : hash;
}

/**
 * Port of `Pubkey::create_program_address`.
 *
 * @param seeds At most 16 seeds of at most 32 bytes each.
 * @param programId base58 program id.
 * @returns base58 address.
 * @throws {SolanaStealthError} `INVALID_SEEDS` (too many/long seeds, or hash on curve), `INVALID_ADDRESS`.
 */
export function createProgramAddress(seeds: readonly Uint8Array[], programId: string): string {
  checkSeeds(seeds, MAX_SEEDS);
  const out = tryCreate(seeds, programIdBytes(programId), isOnCurve);
  if (out === null) return fail('INVALID_SEEDS');
  return encodeAddress(out);
}

/**
 * @internal `find_program_address` with an injectable curve predicate (tests).
 */
export function findProgramAddressWith(
  seeds: readonly Uint8Array[],
  programId: string,
  onCurve: (b: Uint8Array) => boolean,
): ProgramAddress {
  checkSeeds(seeds, MAX_SEEDS - 1);
  const pid = programIdBytes(programId);
  // Mirrors the Rust loop `for _ in 0..u8::MAX`: bumps 255 down to 1; bump 0 is never tried.
  for (let bump = 255; bump >= 1; bump--) {
    const out = tryCreate([...seeds, Uint8Array.of(bump)], pid, onCurve);
    if (out !== null) return { address: encodeAddress(out), bump };
  }
  return fail('NO_VIABLE_BUMP');
}

/**
 * Port of `Pubkey::find_program_address` (off-chain path).
 *
 * @param seeds At most 15 seeds (the bump is appended as the 16th).
 * @param programId base58 program id.
 * @returns Address and the first bump (from 255 down) giving an off-curve hash.
 * @throws {SolanaStealthError} `INVALID_SEEDS`, `INVALID_ADDRESS`, `NO_VIABLE_BUMP`.
 */
export function findProgramAddress(seeds: readonly Uint8Array[], programId: string): ProgramAddress {
  return findProgramAddressWith(seeds, programId, isOnCurve);
}

/** Options for {@link getAssociatedTokenAddress}. */
export interface AtaOptions {
  /** Token program: {@link TOKEN_PROGRAM_ID} (default) or {@link TOKEN_2022_PROGRAM_ID}. */
  readonly tokenProgramId?: string;
  /** Allow an off-curve (PDA) owner. Stealth owners are always on curve. Default false. */
  readonly allowOwnerOffCurve?: boolean;
}

/**
 * Associated token account of (owner, mint): PDA of seeds
 * `[owner, token_program_id, mint]` under the ATA program
 * (associated-token-account-v1.1.0 lib.rs lines 62-75).
 *
 * @param owner base58 wallet address (e.g. a stealth address P).
 * @param mint base58 mint address.
 * @param opts Token program / off-curve owner.
 * @returns base58 ATA address.
 * @throws {SolanaStealthError} `INVALID_ADDRESS` (bad base58, or off-curve owner unless allowed).
 */
export function getAssociatedTokenAddress(owner: string, mint: string, opts: AtaOptions = {}): string {
  const ownerBytes = decodeAddress(owner);
  if (opts.allowOwnerOffCurve !== true && !isOnCurve(ownerBytes)) fail('INVALID_ADDRESS');
  const tokenProgram = decodeAddress(opts.tokenProgramId ?? TOKEN_PROGRAM_ID);
  return findProgramAddress([ownerBytes, tokenProgram, decodeAddress(mint)], ASSOCIATED_TOKEN_PROGRAM_ID)
    .address;
}
