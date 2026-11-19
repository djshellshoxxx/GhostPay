import {
  decodeMetaAddress as decodeEvmMetaAddress,
  encodeMetaAddress as encodeEvmMetaAddress,
  type MetaAddressKeys,
} from '@ghostpay/core-crypto';
import { fail } from './errors.js';

/**
 * TRON meta-address prefix (ADR-0019 section 2): `st:trx:0x<spend33><view33>`, the format `@ghostpay/tron-adapter`
 * and the web app use. `trx` is a GhostPay-local chain tag; the keys are ERC-5564 scheme-1 secp256k1 keys.
 */
export const TRON_META_PREFIX = 'st:trx:0x';
/**
 * EVM scheme-1 prefix. This package used to take `st:eth:0x` meta-addresses for TRON; that form is now refused with
 * `LEGACY_META_ADDRESS`, because a recipient's EVM meta-address need not belong to their TRON wallet.
 */
export const LEGACY_TRON_META_PREFIX = 'st:eth:0x';
/** Announcement memo magic ("GPT1") for `raw_data.data` (ADR-0019 section 2). */
export const TRON_MEMO_MAGIC: Uint8Array = Uint8Array.of(0x47, 0x50, 0x54, 0x31);
/** Memo layout: magic(4) || R(33) || viewTag(1). */
export const TRON_MEMO_LENGTH = 38;

/**
 * Encodes `st:trx:0x` + lowercase hex(spend33 || view33), byte for byte as `@ghostpay/tron-adapter` does.
 *
 * @param keys Compressed spending and viewing public keys (validated by core-crypto).
 * @returns Canonical meta-address.
 * @throws {GhostPayCryptoError} `INVALID_POINT`, `KEY_REUSE` (from core-crypto).
 */
export function encodeTronMetaAddress(keys: MetaAddressKeys): string {
  return TRON_META_PREFIX + encodeEvmMetaAddress(keys).slice(LEGACY_TRON_META_PREFIX.length);
}

/**
 * Strictly decodes `st:trx:0x...`, accepting exactly what `@ghostpay/tron-adapter` accepts.
 *
 * @remarks Case-sensitive prefix; then the core-crypto scheme-1 rules: exactly 132 hex digits (either case;
 * {@link encodeTronMetaAddress} re-emits lowercase), two valid compressed points, spend != view.
 *
 * @param input Candidate meta-address.
 * @returns Validated public keys.
 * @throws {TronError} `LEGACY_META_ADDRESS` for an `st:eth:0x` string, `INVALID_META_ADDRESS` otherwise.
 */
export function decodeTronMetaAddress(input: string): MetaAddressKeys {
  if (typeof input !== 'string') return fail('INVALID_META_ADDRESS');
  if (input.startsWith(LEGACY_TRON_META_PREFIX)) return fail('LEGACY_META_ADDRESS');
  if (!input.startsWith(TRON_META_PREFIX)) return fail('INVALID_META_ADDRESS');
  try {
    return decodeEvmMetaAddress(LEGACY_TRON_META_PREFIX + input.slice(TRON_META_PREFIX.length));
  } catch {
    return fail('INVALID_META_ADDRESS');
  }
}

/** @internal The core-crypto form of a validated TRON meta-address (derivation input only, never shown). */
export function toSchemeOneMetaAddress(input: string): string {
  return encodeEvmMetaAddress(decodeTronMetaAddress(input));
}

/**
 * Builds the `raw_data.data` announcement memo `"GPT1" || R(33) || viewTag(1)`, as `@ghostpay/tron-adapter` does.
 *
 * @param ephemeralPublicKey 33-byte compressed R.
 * @param viewTag Byte 0..255.
 * @returns 38-byte memo.
 * @throws {TronError} `INVALID_INPUT`.
 */
export function buildTronAnnouncementMemo(ephemeralPublicKey: Uint8Array, viewTag: number): Uint8Array {
  if (
    !(ephemeralPublicKey instanceof Uint8Array) ||
    ephemeralPublicKey.length !== 33 ||
    !Number.isInteger(viewTag) ||
    viewTag < 0 ||
    viewTag > 255
  ) {
    return fail('INVALID_INPUT');
  }
  const out = new Uint8Array(TRON_MEMO_LENGTH);
  out.set(TRON_MEMO_MAGIC, 0);
  out.set(ephemeralPublicKey, 4);
  out[37] = viewTag;
  return out;
}

/**
 * Parses a `raw_data.data` memo. Untrusted input: anything that is not a well-formed GhostPay memo yields
 * `undefined` (R is checked later, by `checkTronAnnouncement`).
 *
 * @param memo Memo bytes.
 * @returns R and the view tag, or `undefined`.
 */
export function parseTronAnnouncementMemo(
  memo: Uint8Array,
): { readonly ephemeralPublicKey: Uint8Array; readonly viewTag: number } | undefined {
  if (!(memo instanceof Uint8Array) || memo.length !== TRON_MEMO_LENGTH) return undefined;
  if (TRON_MEMO_MAGIC.some((b, i) => memo[i] !== b)) return undefined;
  return { ephemeralPublicKey: memo.slice(4, 37), viewTag: memo[37] as number };
}
