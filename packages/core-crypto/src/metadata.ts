import { bytesToHex } from '@noble/hashes/utils.js';
import { getAddress } from 'viem/utils';
import { fail } from './errors.js';
import { assertAddress, strictHexToBytes, type Address } from './hex.js';

/** ERC-20 `transfer(address,uint256)` selector. */
export const ERC20_TRANSFER_SELECTOR = 'a9059cbb';
/** Native-asset marker selector. */
export const NATIVE_SELECTOR = 'eeeeeeee';
/** Native-asset pseudo token address (EIP-55). */
export const NATIVE_TOKEN_ADDRESS: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
/** Required announcement metadata length for router payments. */
export const METADATA_LENGTH = 57;

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface ParsedMetadata {
  /** First metadata byte (0..255). */
  readonly viewTag: number;
  readonly kind: 'erc20' | 'native';
  /** Checksummed token address, or {@link NATIVE_TOKEN_ADDRESS} for native. */
  readonly token: Address;
  readonly netAmount: bigint;
}

function tagByte(viewTag: number | Uint8Array): number {
  const v = typeof viewTag === 'number' ? viewTag : viewTag.length === 1 ? viewTag[0] : undefined;
  if (v === undefined || !Number.isInteger(v) || v < 0 || v > 255) return fail('INVALID_VIEW_TAG');
  return v;
}

function build(tag: number, selectorHex: string, tokenHex: string, amount: bigint): Uint8Array {
  if (amount < 1n || amount > MAX_UINT256) fail('INVALID_AMOUNT');
  const hex =
    tag.toString(16).padStart(2, '0') + selectorHex + tokenHex + amount.toString(16).padStart(64, '0');
  return strictHexToBytes(`0x${hex}`, 'INVALID_METADATA');
}

/**
 * Builds the 57-byte ERC-20 payment metadata: tag | 0xa9059cbb | token(20) | net(32 BE).
 *
 * @remarks Layout is enforced on-chain by GhostPayRouter (CONTRACTS_SPEC). The
 * token must be a valid address that is neither zero nor the native marker.
 * Amount must be in [1, 2^256-1].
 *
 * @param viewTag One byte, as number (0..255) or 1-byte array.
 * @param token ERC-20 address (mixed case must be a valid EIP-55 checksum).
 * @param netAmount Net amount delivered to the stealth address, in token base units.
 * @returns 57 bytes.
 * @throws {GhostPayCryptoError} `INVALID_VIEW_TAG`, `INVALID_ADDRESS`, `INVALID_AMOUNT`.
 * @security Metadata is public on-chain; it reveals the token and net amount.
 * @testVector scheme1-001
 */
export function buildErc20Metadata(
  viewTag: number | Uint8Array,
  token: string,
  netAmount: bigint,
): Uint8Array {
  const tag = tagByte(viewTag);
  const addr = assertAddress(token, 'INVALID_ADDRESS');
  const lower = addr.toLowerCase();
  if (lower === ZERO_ADDRESS || lower === NATIVE_TOKEN_ADDRESS.toLowerCase()) fail('INVALID_ADDRESS');
  return build(tag, ERC20_TRANSFER_SELECTOR, lower.slice(2), netAmount);
}

/**
 * Builds the 57-byte native-asset metadata: tag | 0xeeeeeeee | 0xEeee...EEeE | net(32 BE).
 *
 * @remarks Amount must be in [1, 2^256-1].
 *
 * @param viewTag One byte, as number (0..255) or 1-byte array.
 * @param netAmount Net wei delivered to the stealth address.
 * @returns 57 bytes.
 * @throws {GhostPayCryptoError} `INVALID_VIEW_TAG`, `INVALID_AMOUNT`.
 * @security Metadata is public on-chain; it reveals the net amount.
 * @testVector scheme1-001
 */
export function buildNativeMetadata(viewTag: number | Uint8Array, netAmount: bigint): Uint8Array {
  return build(tagByte(viewTag), NATIVE_SELECTOR, NATIVE_TOKEN_ADDRESS.slice(2).toLowerCase(), netAmount);
}

/**
 * Strictly parses 57-byte router metadata (bytes or 0x-hex).
 *
 * @remarks Rejects any other length, unknown selector, a native selector with a
 * non-native token, an ERC-20 selector with zero/native token, and zero amount.
 *
 * @param metadata 57 bytes or 0x-prefixed hex.
 * @returns Parsed fields; token is EIP-55 checksummed.
 * @throws {GhostPayCryptoError} `INVALID_METADATA`.
 * @security Treat contents as untrusted chain data; never render as markup.
 * @testVector scheme1-001
 */
export function parseMetadata(metadata: Uint8Array | string): ParsedMetadata {
  const bytes = typeof metadata === 'string' ? strictHexToBytes(metadata, 'INVALID_METADATA') : metadata;
  if (bytes.length !== METADATA_LENGTH) return fail('INVALID_METADATA');
  const hex = bytesToHex(bytes);
  const selector = hex.slice(2, 10);
  const tokenLower = `0x${hex.slice(10, 50)}`;
  const amount = BigInt(`0x${hex.slice(50)}`);
  if (amount === 0n) fail('INVALID_METADATA');
  const nativeLower = NATIVE_TOKEN_ADDRESS.toLowerCase();
  let kind: 'erc20' | 'native';
  if (selector === NATIVE_SELECTOR) {
    if (tokenLower !== nativeLower) fail('INVALID_METADATA');
    kind = 'native';
  } else if (selector === ERC20_TRANSFER_SELECTOR) {
    if (tokenLower === nativeLower || tokenLower === ZERO_ADDRESS) fail('INVALID_METADATA');
    kind = 'erc20';
  } else {
    return fail('INVALID_METADATA');
  }
  return { viewTag: bytes[0] as number, kind, token: getAddress(tokenLower), netAmount: amount };
}
