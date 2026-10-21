import { address, type Address } from '@solana/kit';

/*
 * Program ids. Source of truth checked on 2026-10-21: the official generated clients published by
 * the `solana-program` GitHub org on npm (`@solana-program/system@0.16.0`,
 * `@solana-program/token@0.18.0`, `@solana-program/token-2022@0.20.0`, `@solana-program/memo@0.16.0`),
 * constants `*_PROGRAM_ADDRESS`. Those packages are NOT dependencies (they require @solana/kit
 * ^8.5.0, released < 2 weeks ago); the few instructions used here are encoded in `instructions.ts`
 * and pinned by tests.
 */

/** System program. */
export const SYSTEM_PROGRAM: Address = address('11111111111111111111111111111111');
/** SPL Token program. */
export const TOKEN_PROGRAM: Address = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/** SPL Token-2022 program (only plain transfers supported; extensions such as transfer hooks or
 *  transfer fees are NOT handled and such mints must be rejected by the caller). */
export const TOKEN_2022_PROGRAM: Address = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
/** Associated Token Account program. */
export const ASSOCIATED_TOKEN_PROGRAM: Address = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
/** SPL Memo program, the long-deployed version (`LEGACY_MEMO_PROGRAM_ADDRESS_V3` in @solana-program/memo). Default for announcements. */
export const MEMO_PROGRAM: Address = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** Original memo program (`LEGACY_MEMO_PROGRAM_ADDRESS_V1`); accepted by the scanner only. */
export const MEMO_PROGRAM_V1: Address = address('Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');
/** New memo program id (`MEMO_PROGRAM_ADDRESS` in @solana-program/memo@0.16.0). Cluster deployment
 *  status UNVERIFIED; accepted by the scanner only, never used to send. */
export const MEMO_PROGRAM_NEW: Address = address('Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH');

/** Memo programs whose instructions the scanner parses. */
export const SCANNED_MEMO_PROGRAMS: readonly Address[] = Object.freeze([
  MEMO_PROGRAM,
  MEMO_PROGRAM_V1,
  MEMO_PROGRAM_NEW,
]);

/** Token programs accepted for SPL payments. */
export const TOKEN_PROGRAMS: readonly Address[] = Object.freeze([TOKEN_PROGRAM, TOKEN_2022_PROGRAM]);
