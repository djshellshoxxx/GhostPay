import { encodeFunctionData, getAddress, hashTypedData } from 'viem/utils';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { fail } from './errors.js';
import { ERC6538_REGISTRY, ERC6538_SCHEME_ID, buildLookupCall, metaAddressToRegistryBytes, type RegistryTx } from './registry.js';
import { MAX_UINT256, ZERO_ADDRESS, type Address, type Hex } from './types.js';

/** Client allocation bound; ERC-1271 signatures are opaque bytes, not necessarily 65-byte EOA signatures. */
export const MAX_REGISTRY_SIGNATURE_BYTES = 8192;

function checkedSignature(signature: Hex): Hex {
  if (typeof signature !== 'string' || signature.length > 2 + MAX_REGISTRY_SIGNATURE_BYTES * 2 || !/^0x(?:[0-9a-fA-F]{2})*$/.test(signature)) {
    return fail('INVALID_INPUT', 'registry signature must be bounded hexadecimal bytes');
  }
  return signature.toLowerCase() as Hex;
}

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
  const authorization = checkedSignature(signature);
  const data = encodeFunctionData({
    abi: erc6538RegistryAbi,
    functionName: 'registerKeysOnBehalf',
    args: [who, ERC6538_SCHEME_ID, authorization, bytes],
  });
  return { to: ERC6538_REGISTRY, data, value: 0n };
}

/** Inputs read from the caller's selected, verified chain and registry. No network access occurs here. */
export interface RegistryDelegationInput {
  readonly chainId: number;
  readonly registrant: string;
  readonly metaAddress: string;
  readonly nonce: bigint;
}

/**
 * Builds an immutable EIP-712 request for the canonical ERC-6538 registry. The reference struct omits the
 * registrant; it is bound by EOA recovery or ERC-1271 verification, not by adding a nonstandard signed field.
 * A valid request does not establish deployment identity or authorize sending a transaction.
 */
export function buildRegistryDelegationRequest(input: RegistryDelegationInput) {
  const { chainId, registrant, metaAddress, nonce } = input;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return fail('INVALID_INPUT', 'registry chainId must be a positive safe integer');
  if (typeof nonce !== 'bigint' || nonce < 0n || nonce > MAX_UINT256) return fail('INVALID_INPUT', 'registry nonce must be a uint256 bigint');
  const who = checkedRegistrant(registrant);
  if (who === ZERO_ADDRESS) return fail('INVALID_INPUT', 'registry registrant must not be the zero address');
  const bytes = metaAddressToRegistryBytes(metaAddress);
  const typedData = Object.freeze({
    domain: Object.freeze({ name: 'ERC6538Registry', version: '1.0', chainId, verifyingContract: ERC6538_REGISTRY }),
    primaryType: 'Erc6538RegistryEntry' as const,
    types: Object.freeze({
      Erc6538RegistryEntry: Object.freeze([
        Object.freeze({ name: 'schemeId', type: 'uint256' } as const),
        Object.freeze({ name: 'stealthMetaAddress', type: 'bytes' } as const),
        Object.freeze({ name: 'nonce', type: 'uint256' } as const),
      ] as const),
    }),
    message: Object.freeze({ schemeId: ERC6538_SCHEME_ID, stealthMetaAddress: bytes, nonce }),
  });
  return Object.freeze({ registrant: who, metaAddress: `st:eth:${bytes}`, typedData, digest: hashTypedData(typedData) });
}

export type RegistryDelegationRequest = ReturnType<typeof buildRegistryDelegationRequest>;
export interface SignedRegistryDelegation extends RegistryDelegationRequest {
  readonly signature: Hex;
  readonly transaction: Readonly<RegistryTx>;
}
export interface RegistryDelegationCallbacks {
  /** Explicit wallet approval or an external contract-wallet signing transport. Must not send a transaction. */
  readonly sign: (request: RegistryDelegationRequest) => Promise<Hex>;
  /**
   * Require the verified chain ID and current registry nonce to match typedData, and authenticate the selected
   * registrant and exact authorization. Then simulate transaction.data against the verified registry to validate
   * its EOA or ERC-1271 path. Simulation alone cannot check the request's chainId/nonce fields: they are not calldata.
   * Return true only on success; unavailable RPCs, wrong accounts, stale nonces and rejected signatures must fail.
   */
  readonly verify: (authorization: SignedRegistryDelegation) => Promise<boolean>;
}

/**
 * Obtains and verifies a bounded signature through explicit caller-owned boundaries. Empty and variable-length
 * ERC-1271 signatures remain opaque. Deeply frozen snapshots prevent asynchronous input mutation from changing
 * what is signed or verified. This helper neither obtains private keys nor sends a transaction. The caller must
 * recheck chain, deployment and nonce and simulate again before an independently confirmed broadcast; successful
 * verification is only a point-in-time result, since another transaction can consume or invalidate the nonce.
 */
export async function signRegistryDelegation(input: RegistryDelegationInput, callbacks: RegistryDelegationCallbacks): Promise<SignedRegistryDelegation> {
  if (callbacks === null || typeof callbacks !== 'object' || typeof callbacks.sign !== 'function' || typeof callbacks.verify !== 'function') {
    return fail('INVALID_INPUT', 'registry signing and verification callbacks are required');
  }
  const { sign, verify } = callbacks;
  const request = buildRegistryDelegationRequest(input);
  const signature = checkedSignature(await sign(request));
  const transaction = Object.freeze(buildRegisterKeysOnBehalfTx(request.registrant, request.metaAddress, signature));
  const authorization = Object.freeze({ ...request, signature, transaction });
  if (await verify(authorization) !== true) return fail('SIGNING_FAILED', 'registry signature verification failed');
  return authorization;
}
