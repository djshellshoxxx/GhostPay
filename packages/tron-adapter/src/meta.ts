import {
  checkAnnouncement,
  decodeMetaAddress as decodeEthMeta,
  deriveStealthPayment,
  deriveStealthSecret,
  encodeMetaAddress as encodeEthMeta,
  type CompressedPoint,
  type RandomSource,
  type SecretScalar,
} from '@ghostpay/core-crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { tronAddressFromEvm, tronAddressFromPublicKey, tronAddressToEvmHex } from './address.js';
import { fail } from './errors.js';

/** Meta-address prefix: ERC-5564 form `st:<chain>:0x<spend33><view33>`; `trx` is a GhostPay-local tag. */
export const TRON_META_PREFIX = 'st:trx:0x';
/** Announcement memo magic ("GPT1") placed in `raw_data.data`. */
export const MEMO_MAGIC = Uint8Array.of(0x47, 0x50, 0x54, 0x31);
/** Memo layout: magic(4) || R(33) || viewTag(1). */
export const MEMO_LENGTH = 38;

/** Keys of a TRON meta-address (same secp256k1 scheme-1 keys as EVM). */
export interface TronMetaKeys {
  readonly spendingPublicKey: CompressedPoint;
  readonly viewingPublicKey: CompressedPoint;
}

/** Encodes `st:trx:0x...`. */
export function encodeTronMetaAddress(keys: TronMetaKeys): string {
  return TRON_META_PREFIX + encodeEthMeta(keys).slice('st:eth:0x'.length);
}

/** Strict decode of `st:trx:0x...` (validates both points). */
export function decodeTronMetaAddress(input: string): TronMetaKeys {
  if (typeof input !== 'string' || !input.startsWith(TRON_META_PREFIX)) return fail('INVALID_META_ADDRESS');
  try {
    return decodeEthMeta(`st:eth:0x${input.slice(TRON_META_PREFIX.length)}`);
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
}

/** Public result of a sender-side derivation. */
export interface TronStealthPayment {
  /** Base58 one-time TRON address. */
  readonly stealthAddress: string;
  readonly ephemeralPublicKey: CompressedPoint;
  readonly viewTag: number;
  /** 38-byte announcement memo for `raw_data.data`. */
  readonly memo: Uint8Array;
}

/** Builds the announcement memo. */
export function buildAnnouncementMemo(ephemeral: Uint8Array, viewTag: number): Uint8Array {
  if (ephemeral.length !== 33 || !Number.isInteger(viewTag) || viewTag < 0 || viewTag > 255) return fail('INVALID_MEMO');
  const out = new Uint8Array(MEMO_LENGTH);
  out.set(MEMO_MAGIC, 0);
  out.set(ephemeral, 4);
  out[37] = viewTag;
  return out;
}

/** Parses a memo; returns undefined for anything that is not a well-formed GhostPay memo. */
export function parseAnnouncementMemo(memo: Uint8Array): { ephemeral: Uint8Array; viewTag: number } | undefined {
  if (memo.length !== MEMO_LENGTH || MEMO_MAGIC.some((b, i) => memo[i] !== b)) return undefined;
  return { ephemeral: memo.slice(4, 37), viewTag: memo[37] as number };
}

/**
 * Derives a fresh one-time TRON address via core-crypto scheme-1 (secp256k1 + keccak256 shared
 * hash). The EVM address bytes (keccak256(pubkey)[12:]) are identical to TRON's; only the
 * 0x41 + base58check encoding differs.
 */
export function deriveTronStealth(meta: string, rng?: RandomSource): TronStealthPayment {
  const keys = decodeTronMetaAddress(meta);
  const d = deriveStealthPayment(encodeEthMeta(keys), rng);
  const viewTag = d.viewTag[0] as number;
  return {
    stealthAddress: tronAddressFromEvm(d.stealthAddress),
    ephemeralPublicKey: d.ephemeralPublicKey,
    viewTag,
    memo: buildAnnouncementMemo(d.ephemeralPublicKey, viewTag),
  };
}

/** One announcement as seen on-chain. */
export interface TronAnnouncement {
  /** Recipient of the transfer (base58). */
  readonly stealthAddress: string;
  readonly memo: Uint8Array;
}

/**
 * True when the announcement pays the holder of the viewing key. Malformed memos never throw.
 * Reuses `checkAnnouncement` (view-tag early reject, then full address recomputation).
 */
export function checkTronAnnouncement(
  a: TronAnnouncement,
  viewingSecret: SecretScalar,
  spendingPublicKey: CompressedPoint,
): boolean {
  const p = parseAnnouncementMemo(a.memo);
  if (p === undefined) return false;
  let evm: string;
  try {
    evm = `0x${tronAddressToEvmHex(a.stealthAddress)}`;
  } catch {
    return false;
  }
  return checkAnnouncement(
    {
      schemeId: 1n,
      stealthAddress: evm,
      ephemeralPublicKey: `0x${bytesToHex(p.ephemeral)}`,
      metadata: `0x${bytesToHex(Uint8Array.of(p.viewTag))}`,
    },
    viewingSecret,
    spendingPublicKey,
  ).matches;
}

/**
 * Derives the one-time private key for a matched announcement and verifies that it controls the
 * announced TRON address before returning it.
 * @security Result is a spendable key; zeroize after use.
 */
export function deriveTronStealthKey(
  a: TronAnnouncement,
  keys: { readonly viewingSecret: SecretScalar; readonly spendingSecret: SecretScalar },
): SecretScalar {
  const p = parseAnnouncementMemo(a.memo);
  if (p === undefined) return fail('INVALID_MEMO');
  const secret = deriveStealthSecret(
    {
      schemeId: 1n,
      stealthAddress: `0x${tronAddressToEvmHex(a.stealthAddress)}`,
      ephemeralPublicKey: `0x${bytesToHex(p.ephemeral)}`,
      metadata: `0x${bytesToHex(Uint8Array.of(p.viewTag))}`,
    },
    keys,
  );
  const raw = new Uint8Array(secret);
  try {
    if (tronAddressFromPublicKey(secp256k1.getPublicKey(raw, true)) !== a.stealthAddress) return fail('KEY_MISMATCH');
  } finally {
    raw.fill(0);
  }
  return secret;
}

