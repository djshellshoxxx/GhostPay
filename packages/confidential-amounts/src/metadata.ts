import { bytesToHex, getAddress, hexToBytes, type Address, type Hex } from 'viem';
import { CT_SELECTOR, METADATA_LENGTH } from './abi.js';
import { CtError, requireInput } from './errors.js';
import { parseAddress } from './manifest.js';

const SELECTOR_BYTES = hexToBytes(CT_SELECTOR);

/** A parsed confidential announcement metadata field. */
export interface ConfidentialMetadata {
  /** Confidential token the payment used. */
  readonly token: Address;
  /** 32-byte handle of the encrypted net amount. Not a value: it must be decrypted. */
  readonly amountHandle: Hex;
  /** ERC-5564 view tag (first byte). */
  readonly viewTag: number;
}

/**
 * Builds the 57-byte announcement metadata `viewTag | 0x5bebed7e | token | handle` (spec 6.4).
 * @param viewTag View tag, integer 0..255.
 * @param token Confidential token address.
 * @param handle Non-zero 32-byte handle.
 * @throws {CtError} `INVALID_INPUT` on malformed arguments.
 */
export function buildConfidentialMetadata(viewTag: number, token: Address, handle: Hex): Uint8Array {
  requireInput(Number.isInteger(viewTag) && viewTag >= 0 && viewTag <= 255, 'viewTag must be 0..255');
  const tokenBytes = hexToBytes(parseAddress(token, 'token'));
  requireInput(/^0x[0-9a-fA-F]{64}$/.test(handle), 'handle must be 32 bytes');
  const handleBytes = hexToBytes(handle);
  requireInput(handleBytes.some((b) => b !== 0), 'handle must not be zero');
  const out = new Uint8Array(METADATA_LENGTH);
  out[0] = viewTag;
  out.set(SELECTOR_BYTES, 1);
  out.set(tokenBytes, 5);
  out.set(handleBytes, 25);
  return out;
}

/**
 * Parses announcement metadata. Returns `null` for anything that is not exactly a confidential
 * payment marker (wrong length, wrong selector such as the plaintext `0xa9059cbb`, zero handle).
 * @security The handle is a pointer, never an amount. A parsed payment is UNCONFIRMED until the
 * seller decrypts it (silent zero transfers and spam announcements are possible, spec R-5).
 */
export function parseConfidentialMetadata(m: Uint8Array): ConfidentialMetadata | null {
  if (m.length !== METADATA_LENGTH) return null;
  for (let i = 0; i < SELECTOR_BYTES.length; i++) {
    if (m[1 + i] !== SELECTOR_BYTES[i]) return null;
  }
  const handleBytes = m.slice(25, 57);
  if (!handleBytes.some((b) => b !== 0)) return null;
  const viewTag = m[0];
  if (viewTag === undefined) return null;
  return {
    token: getAddress(bytesToHex(m.slice(5, 25))),
    amountHandle: bytesToHex(handleBytes),
    viewTag,
  };
}

/** True if `m` is a well-formed confidential payment metadata field. */
export function isConfidentialMetadata(m: Uint8Array): boolean {
  return parseConfidentialMetadata(m) !== null;
}

/** @internal Asserts a 32-byte non-zero handle. */
export function assertHandle(handle: Hex, label: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(handle)) throw new CtError('INVALID_INPUT', `${label} must be a 32-byte handle`);
}
