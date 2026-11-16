import { encodeFunctionData, getAddress } from 'viem/utils';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { fail } from './errors.js';
import { ERC6538_REGISTRY, ERC6538_SCHEME_ID, buildLookupCall, metaAddressToRegistryBytes, type RegistryTx } from './registry.js';
import type { Address, Hex } from './types.js';

/** Client allocation bound; ERC-1271 signatures are opaque bytes, not necessarily 65-byte EOA signatures. */
export const MAX_REGISTRY_SIGNATURE_BYTES = 8192;

function checkedRegistrant(registrant: string): Address {
  // Share the existing address/checksum validation used by direct registry lookups.
  buildLookupCall(registrant);
  return getAddress(registrant);
}

/**
 * Builds the canonical `nonceOf(registrant)` read; execute it using the caller's verified chain/RPC.
 * This helper performs no network request or deployment verification.
 */
export function buildRegistryNonceCall(registrant: string): RegistryTx {
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'nonceOf', args: [checkedRegistrant(registrant)] });
  return { to: ERC6538_REGISTRY, data, value: 0n };
}

/**
 * Invalidates outstanding on-behalf signatures by incrementing the sending wallet's registry nonce.
 * The caller must verify the selected chain/deployment and obtain explicit wallet confirmation before sending.
 */
export function buildIncrementNonceTx(): RegistryTx {
  return { to: ERC6538_REGISTRY, data: encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'incrementNonce' }), value: 0n };
}

/**
 * Encodes ERC-6538 `registerKeysOnBehalf(address,uint256,bytes,bytes)` for scheme 1.
 * Source: https://eips.ethereum.org/EIPS/eip-6538 (canonical interface, checked 2026-11-16).
 *
 * `signature` must already authorize this meta-address, current registry nonce and selected chain's EIP-712 domain.
 * This builder does not create or authenticate a signature; the registry validates EOA/ERC-1271 authorization.
 * Empty and variable-length ERC-1271 signatures are retained. No network request or wallet send occurs here.
 */
export function buildRegisterKeysOnBehalfTx(registrant: string, metaAddress: string, signature: Hex): RegistryTx {
  const who = checkedRegistrant(registrant);
  const bytes = metaAddressToRegistryBytes(metaAddress);
  if (typeof signature !== 'string' || signature.length > 2 + MAX_REGISTRY_SIGNATURE_BYTES * 2 || !/^0x(?:[0-9a-fA-F]{2})*$/.test(signature)) {
    return fail('INVALID_INPUT', 'registry signature must be bounded hexadecimal bytes');
  }
  const data = encodeFunctionData({
    abi: erc6538RegistryAbi,
    functionName: 'registerKeysOnBehalf',
    args: [who, ERC6538_SCHEME_ID, signature.toLowerCase() as Hex, bytes],
  });
  return { to: ERC6538_REGISTRY, data, value: 0n };
}
