/**
 * Strict hex / address / signature validators shared by the connect modules.
 * Pure functions, no I/O.
 *
 * @security Every value that crosses a trust boundary (wallet responses,
 * links, imported JSON) is validated here before any other module trusts it.
 */

/** Discriminated result used by all fallible functions (never throws on bad input). */
export type Result<T, E = string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Build a success result. */
export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value });
/** Build a failure result. */
export const err = <E>(error: E): { readonly ok: false; readonly error: E } => ({ ok: false, error });

/** True for non-null, non-array objects. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 0x-prefixed (lowercase or uppercase) hex of any even length, including "0x". */
export function isHexData(v: unknown): v is string {
  return typeof v === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(v);
}

/** 20-byte address, case-insensitive. EIP-55 checksum is NOT verified (needs keccak). */
export function isAddress(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** 32-byte hash. */
export function isBytes32(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** JSON-RPC QUANTITY: "0x0" or 0x without leading zeros, max 32 bytes. */
export function isHexQuantity(v: unknown): v is string {
  return typeof v === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(v);
}

/** Parse a QUANTITY to bigint, or null if invalid. */
export function quantityToBigInt(v: unknown): bigint | null {
  return isHexQuantity(v) ? BigInt(v) : null;
}

/** secp256k1 group order. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = N >> 1n;

/**
 * Validate a 65-byte r||s||v signature. Rejects zero r/s, r/s >= n, high-s
 * (malleable) and v outside {0,1,27,28}. Anything that is not exactly 65
 * bytes (e.g. a 32-byte private key) is rejected.
 *
 * @security Enforces HWSIG-2: only signatures, never key material, pass the
 * signer boundary. Does NOT prove the signature matches a message (that needs
 * ecrecover, done by the host app with its existing crypto).
 */
export function validateSignature(sig: unknown): Result<string> {
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig))
    return err('signature must be 65 bytes of hex');
  const r = BigInt('0x' + sig.slice(2, 66));
  const s = BigInt('0x' + sig.slice(66, 130));
  const v = parseInt(sig.slice(130, 132), 16);
  if (r === 0n || r >= N) return err('r out of range');
  if (s === 0n || s >= N) return err('s out of range');
  if (s > HALF_N) return err('s is not in the lower half (malleable)');
  if (v !== 0 && v !== 1 && v !== 27 && v !== 28) return err('invalid v');
  return ok(sig.toLowerCase());
}

/** Format an integer amount with `decimals` as an exact decimal string (no rounding). */
export function formatUnits(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77)
    throw new RangeError('decimals out of range');
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const s = abs.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals === 0 ? '' : s.slice(s.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
}
