import { decodeMetaAddress, encodeMetaAddress, parseCompressedPoint } from '@ghostpay/core-crypto';
import { bytesToHex, decodeFunctionResult, encodeFunctionData, getAddress, hexToBytes, isAddress } from 'viem/utils';
import { erc6538RegistryAbi } from './abi/erc6538.js';
import { fail } from './errors.js';
import { codehashOf } from './readback.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Canonical ERC-6538 registry address (same on every chain it is deployed to). */
export const REGISTRY_ADDRESS: Address = getAddress('0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538');

/** ERC-5564 scheme id for secp256k1 with view tags: the only scheme GhostPay registers. */
export const REGISTRY_SCHEME_ID = 1n;

/**
 * Pinned `keccak256` of the registry's runtime code per chain id. EMPTY on purpose: no codehash could be
 * verified against a trusted source in this environment, so no chain is enabled by default. Callers pass an
 * explicit, independently verified hash to {@link assertRegistryAvailable}.
 */
export const REGISTRY_CODEHASHES: Readonly<Record<number, Hex>> = Object.freeze({});

/** An unsigned transaction request (no gas/nonce/chain fields: the wallet fills those). */
export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

/**
 * Registry encoding of a scheme-1 meta-address: 66 bytes, spending key then viewing key.
 *
 * @param metaAddress `st:eth:0x...` string (decoded and fully validated; two distinct valid points).
 * @returns `0x` + 132 hex digits.
 * @throws `GhostPayCryptoError` for an invalid meta-address.
 */
export function registryMetaBytes(metaAddress: string): Hex {
  const k = decodeMetaAddress(metaAddress);
  const out = new Uint8Array(66);
  out.set(k.spendingPublicKey, 0);
  out.set(k.viewingPublicKey, 33);
  return bytesToHex(out);
}

/**
 * Builds `registerKeys(1, metaBytes)`. Publishing PERMANENTLY and PUBLICLY associates the sending wallet
 * address with this meta-address on this chain; the caller's UI must obtain explicit confirmation.
 *
 * @param metaAddress Scheme-1 meta-address string.
 * @returns Transaction to the canonical registry, value 0.
 * @throws `GhostPayCryptoError` for an invalid meta-address.
 */
export function buildRegisterKeys(metaAddress: string): TxRequest {
  const data = encodeFunctionData({
    abi: erc6538RegistryAbi,
    functionName: 'registerKeys',
    args: [REGISTRY_SCHEME_ID, registryMetaBytes(metaAddress)],
  });
  return { to: REGISTRY_ADDRESS, data, value: 0n };
}

/**
 * Builds `registerKeys(1, 0x)`: un-registers (overwrites with empty bytes). Recommended promptly after a
 * key compromise (ERC-6538 guidance).
 *
 * @returns Transaction to the canonical registry, value 0.
 */
export function buildClearKeys(): TxRequest {
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [REGISTRY_SCHEME_ID, '0x'] });
  return { to: REGISTRY_ADDRESS, data, value: 0n };
}

/**
 * Builds `registerKeysOnBehalf`. The EIP-712 signature must be produced by the registrant elsewhere; typed-data
 * construction is NOT provided (domain constants unverified, see DEVIATIONS). Not exposed in UI v1.
 *
 * @param registrant Account the signature belongs to.
 * @param signature 65-byte ECDSA or ERC-1271 signature.
 * @param metaAddress Scheme-1 meta-address string.
 * @returns Transaction to the canonical registry, value 0.
 * @throws {ChainAdapterError} `INVALID_INPUT` for a bad registrant or signature.
 */
export function buildRegisterKeysOnBehalf(registrant: string, signature: string, metaAddress: string): TxRequest {
  if (!isAddress(registrant, { strict: true })) return fail('INVALID_INPUT', 'registrant');
  if (!/^0x(?:[0-9a-fA-F]{2}){1,1024}$/.test(signature)) return fail('INVALID_INPUT', 'signature');
  const data = encodeFunctionData({
    abi: erc6538RegistryAbi,
    functionName: 'registerKeysOnBehalf',
    args: [getAddress(registrant), REGISTRY_SCHEME_ID, signature as Hex, registryMetaBytes(metaAddress)],
  });
  return { to: REGISTRY_ADDRESS, data, value: 0n };
}

/**
 * Builds `incrementNonce()`, which invalidates outstanding on-behalf signatures.
 *
 * @returns Transaction to the canonical registry, value 0.
 */
export function buildIncrementNonce(): TxRequest {
  return { to: REGISTRY_ADDRESS, data: encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'incrementNonce' }), value: 0n };
}

/**
 * Looks up the scheme-1 meta-address a registrant published.
 *
 * @remarks The registry is a public, permissionless mapping: only trust a result for the registrant you
 * expected, and prefer signed invoice data. Empty or malformed entries (wrong length, off-curve or identical
 * keys) return `null` (ignored, never thrown). Transport or ABI-shape failures throw.
 *
 * @param client Verified client.
 * @param registrant Account to look up.
 * @returns Canonical `st:eth:0x...` string, or `null`.
 * @throws {ChainAdapterError} `INVALID_INPUT`, `RPC_FAILURE`.
 */
export async function lookupMeta(client: Pick<RpcClient, 'request'>, registrant: string): Promise<string | null> {
  if (!isAddress(registrant, { strict: true })) return fail('INVALID_INPUT', 'registrant');
  const data = encodeFunctionData({
    abi: erc6538RegistryAbi,
    functionName: 'stealthMetaAddressOf',
    args: [getAddress(registrant), REGISTRY_SCHEME_ID],
  });
  const r = await client.request('eth_call', [{ to: REGISTRY_ADDRESS, data }, 'latest']);
  if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(r)) return fail('RPC_FAILURE', 'eth_call result');
  let bytes: Hex;
  try {
    bytes = decodeFunctionResult({ abi: erc6538RegistryAbi, functionName: 'stealthMetaAddressOf', data: r as Hex });
  } catch {
    return fail('RPC_FAILURE', 'registry return data');
  }
  const raw = hexToBytes(bytes);
  if (raw.length !== 66) return null;
  try {
    return encodeMetaAddress({ spendingPublicKey: parseCompressedPoint(raw.slice(0, 33)), viewingPublicKey: parseCompressedPoint(raw.slice(33)) });
  } catch {
    return null;
  }
}

/**
 * Fail-closed availability gate: the canonical address must hold real code (not empty, not an EIP-7702
 * delegation) whose `keccak256` equals a caller-supplied, independently verified hash.
 *
 * @param client Verified client.
 * @param expectedCodehash Pinned runtime codehash for this chain (see {@link REGISTRY_CODEHASHES}).
 * @throws {ChainAdapterError} `REGISTRY_UNAVAILABLE` (no pin, no code, mismatch) or `RPC_FAILURE`.
 */
export async function assertRegistryAvailable(client: Pick<RpcClient, 'request' | 'chainId'>, expectedCodehash: Hex | undefined): Promise<void> {
  const pinned = expectedCodehash ?? REGISTRY_CODEHASHES[client.chainId];
  if (pinned === undefined || !/^0x[0-9a-fA-F]{64}$/.test(pinned)) return fail('REGISTRY_UNAVAILABLE', 'no pinned codehash for this chain');
  const code = await client.request('eth_getCode', [REGISTRY_ADDRESS, 'latest']);
  let h: Hex;
  try {
    h = codehashOf(code);
  } catch {
    return fail('REGISTRY_UNAVAILABLE', 'no usable code at registry address');
  }
  if (h.toLowerCase() !== pinned.toLowerCase()) return fail('REGISTRY_UNAVAILABLE', 'registry codehash mismatch');
}

