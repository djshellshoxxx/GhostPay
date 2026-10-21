import { decodeMetaAddress, encodeMetaAddress } from '@ghostpay/core-crypto';
import { decodeFunctionData, decodeFunctionResult, encodeFunctionData, keccak256, toBytes } from 'viem/utils';
import { erc6538RegistryAbi } from './abi/erc6538Registry.js';
import { fail } from './errors.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Canonical ERC-6538 registry (`docs/CONTRACTS_SPEC.md` section 1; same address on every chain it is deployed to). */
export const ERC6538_REGISTRY: Address = '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538';
/** ERC-5564 scheme id registered by GhostPay (secp256k1 with view tags). */
export const ERC6538_SCHEME_ID = 1n;
/** `keccak256("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)")`. */
export const ERC6538_ENTRY_TYPEHASH: Hex = keccak256(toBytes('Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)'));

/**
 * Checks, through the user's RPC, that the canonical registry address holds contract code and answers
 * `ERC6538REGISTRY_ENTRY_TYPE_HASH()` with the known constant. Run it before any registry write or lookup.
 *
 * @remarks This is a behavioural probe, not a code-hash pin: no runtime code hash of the deployed registry has been
 * verified from an official source (see TODO-VERIFY.md). A hostile RPC can still fake both answers.
 *
 * @param client Verified client.
 * @throws {ChainAdapterError} `DEPLOYMENT_UNVERIFIED` when there is no code or the probe fails.
 */
export async function verifyRegistry(client: RpcClient): Promise<void> {
  const code = await client.request('eth_getCode', [ERC6538_REGISTRY, 'latest']);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
    return fail('DEPLOYMENT_UNVERIFIED', 'the ERC-6538 registry is not deployed on this chain');
  }
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'ERC6538REGISTRY_ENTRY_TYPE_HASH' });
  const r = await client.request('eth_call', [{ to: ERC6538_REGISTRY, data }, 'latest']);
  if (typeof r !== 'string' || r.toLowerCase() !== ERC6538_ENTRY_TYPEHASH.toLowerCase()) {
    return fail('DEPLOYMENT_UNVERIFIED', 'the ERC-6538 registry did not answer as expected');
  }
}

/** Raw 66-byte registry value (spending key || viewing key) of a `st:eth:0x...` meta-address. */
export function registryBytesFor(metaAddress: string): Hex {
  const k = decodeMetaAddress(metaAddress);
  const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `0x${hex(k.spendingPublicKey)}${hex(k.viewingPublicKey)}`;
}

/** Transaction shape produced by {@link buildRegisterKeysTx}. */
export interface RegistryTx {
  readonly to: Address;
  readonly data: Hex;
  readonly value: 0n;
}

/**
 * `registerKeys(1, metaAddressBytes)` on the canonical registry. The caller (`msg.sender`) becomes the registrant and
 * the association "this wallet address owns this meta-address" becomes PUBLIC and permanent in the chain history.
 *
 * @param metaAddress Meta-address string.
 * @returns Transaction to send from the registrant wallet.
 */
export function buildRegisterKeysTx(metaAddress: string): RegistryTx {
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [ERC6538_SCHEME_ID, registryBytesFor(metaAddress)] });
  return { to: ERC6538_REGISTRY, data, value: 0n };
}

/**
 * Independently decodes a registry transaction and requires it to be exactly `registerKeys(1, bytes(metaAddress))`
 * to the canonical registry with no value.
 *
 * @throws {ChainAdapterError} `PREVIEW_MISMATCH` on any difference.
 */
export function assertRegisterKeysTx(tx: { readonly to: string; readonly data: Hex; readonly value: bigint }, metaAddress: string): void {
  let d: ReturnType<typeof decodeFunctionData<typeof erc6538RegistryAbi>>;
  try {
    d = decodeFunctionData({ abi: erc6538RegistryAbi, data: tx.data });
  } catch {
    return fail('PREVIEW_MISMATCH', 'registry calldata cannot be decoded');
  }
  if (d.functionName !== 'registerKeys' || tx.value !== 0n || tx.to.toLowerCase() !== ERC6538_REGISTRY.toLowerCase()) {
    return fail('PREVIEW_MISMATCH', 'unexpected registry transaction');
  }
  const [scheme, bytes] = d.args;
  if (scheme !== ERC6538_SCHEME_ID || bytes.toLowerCase() !== registryBytesFor(metaAddress).toLowerCase()) {
    return fail('PREVIEW_MISMATCH', 'registry calldata differs from the meta-address');
  }
}

/**
 * Reads `stealthMetaAddressOf(registrant, 1)` from the canonical registry.
 *
 * @remarks An entry is self-published by `registrant`; it proves nothing about who that wallet belongs to. Call
 * {@link verifyRegistry} first. Malformed registry content is rejected, never partially parsed.
 *
 * @param client Verified client.
 * @param registrant Wallet address to look up.
 * @returns The canonical meta-address string, or `undefined` when nothing is registered.
 * @throws {ChainAdapterError} `RPC_FAILURE` for a malformed answer or entry.
 */
export async function lookupMetaAddress(client: RpcClient, registrant: Address): Promise<string | undefined> {
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'stealthMetaAddressOf', args: [registrant, ERC6538_SCHEME_ID] });
  const r = await client.request('eth_call', [{ to: ERC6538_REGISTRY, data }, 'latest']);
  if (typeof r !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(r)) return fail('RPC_FAILURE', 'malformed registry answer');
  let bytes: Hex;
  try {
    bytes = decodeFunctionResult({ abi: erc6538RegistryAbi, functionName: 'stealthMetaAddressOf', data: r as Hex });
  } catch {
    return fail('RPC_FAILURE', 'malformed registry answer');
  }
  if (bytes === '0x') return undefined;
  if (!/^0x[0-9a-fA-F]{132}$/.test(bytes)) return fail('RPC_FAILURE', 'registry entry has an unexpected length');
  try {
    const raw = bytes.slice(2);
    return encodeMetaAddress(decodeMetaAddress(`st:eth:0x${raw}`));
  } catch {
    return fail('RPC_FAILURE', 'registry entry is not a valid meta-address');
  }
}
