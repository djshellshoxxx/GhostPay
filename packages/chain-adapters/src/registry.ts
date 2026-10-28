import { erc6538RegistryAbi as referenceRegistryAbi } from './abi/erc6538Registry.js';
import { decodeMetaAddress } from '@ghostpay/core-crypto';
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, getAddress, isAddress, keccak256, toBytes } from 'viem/utils';
import { fail } from './errors.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/**
 * Canonical ERC-6538 registry: a singleton deployed with CREATE2 through the deterministic deployer
 * (`0x4e59b44847b379578588920ca78fbf26c0b4956c`, salt `0x7cac4e51...da078`).
 * Source: https://eips.ethereum.org/EIPS/eip-6538 (Deployment section), verified from the EIP text.
 * Existence on a given chain is NOT assumed: {@link assertRegistryDeployed} fails closed when no code is found.
 */
export const ERC6538_REGISTRY_ADDRESS: Address = '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538';

/** ERC-5564 scheme id for secp256k1 with view tags. */
export const ERC6538_SCHEME_SECP256K1 = 1n;

/** Exact byte length of a scheme-1 registry entry: compressed spending key then compressed viewing key. */
export const ERC6538_ENTRY_BYTES = 66;

/** Subset of the EIP-6538 interface that GhostPay uses (signatures copied from the EIP reference interface). */
export const erc6538RegistryAbi = [
  {
    type: 'function',
    name: 'registerKeys',
    inputs: [
      { name: 'schemeId', type: 'uint256', internalType: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'stealthMetaAddressOf',
    inputs: [
      { name: 'registrant', type: 'address', internalType: 'address' },
      { name: 'schemeId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'StealthMetaAddressSet',
    inputs: [
      { name: 'registrant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'schemeId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes', indexed: false, internalType: 'bytes' },
    ],
    anonymous: false,
  },
] as const;

/** A transaction or call the UI previews before anything is sent. */
export interface RegistryCall {
  readonly to: Address;
  readonly data: Hex;
  readonly value: 0n;
  /** Human-readable summary shown in the review step. */
  readonly preview: {
    readonly contract: Address;
    readonly function: string;
    readonly schemeId: bigint;
    readonly metaAddress?: string;
    readonly registrant?: Address;
  };
}

/** Converts `st:eth:0x<66 bytes>` to the registry byte string (no prefix). Strict: validates both keys on-curve. */
export function metaAddressToRegistryBytes(metaAddress: string): Hex {
  try {
    decodeMetaAddress(metaAddress);
  } catch {
    return fail('INVALID_INPUT', 'not a valid scheme-1 meta-address');
  }
  return `0x${metaAddress.slice('st:eth:0x'.length).toLowerCase()}`;
}

/** Inverse of {@link metaAddressToRegistryBytes}; rejects wrong length or invalid keys. */
export function registryBytesToMetaAddress(bytes: Hex): string {
  if (!/^0x[0-9a-fA-F]+$/.test(bytes) || bytes.length !== 2 + ERC6538_ENTRY_BYTES * 2) {
    return fail('INVALID_INPUT', 'registry entry has the wrong length');
  }
  const meta = `st:eth:${bytes.toLowerCase()}`;
  try {
    decodeMetaAddress(meta);
  } catch {
    return fail('INVALID_INPUT', 'registry entry holds invalid keys');
  }
  return meta;
}

/** Builds `registerKeys(1, metaAddress)` against the canonical registry. */
export function buildRegisterKeysCall(metaAddress: string): RegistryCall {
  const bytes = metaAddressToRegistryBytes(metaAddress);
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'registerKeys', args: [ERC6538_SCHEME_SECP256K1, bytes] });
  return {
    to: ERC6538_REGISTRY_ADDRESS,
    data,
    value: 0n,
    preview: {
      contract: ERC6538_REGISTRY_ADDRESS,
      function: 'registerKeys(uint256,bytes)',
      schemeId: ERC6538_SCHEME_SECP256K1,
      metaAddress: registryBytesToMetaAddress(bytes),
    },
  };
}

/**
 * Builds the read-only `stealthMetaAddressOf(registrant, 1)` call. A mixed-case registrant must carry a valid EIP-55
 * checksum (all-lowercase is accepted): a mistyped or altered address is refused, never normalized into another one.
 */
export function buildLookupCall(registrant: string): RegistryCall {
  if (!isAddress(registrant, { strict: false })) return fail('INVALID_INPUT', 'registrant is not an address');
  if (!isAddress(registrant, { strict: true })) return fail('INVALID_INPUT', 'registrant address checksum does not match');
  const who = getAddress(registrant);
  const data = encodeFunctionData({ abi: erc6538RegistryAbi, functionName: 'stealthMetaAddressOf', args: [who, ERC6538_SCHEME_SECP256K1] });
  return {
    to: ERC6538_REGISTRY_ADDRESS,
    data,
    value: 0n,
    preview: { contract: ERC6538_REGISTRY_ADDRESS, function: 'stealthMetaAddressOf(address,uint256)', schemeId: ERC6538_SCHEME_SECP256K1, registrant: who },
  };
}

/** Largest `eth_getCode` answer accepted (the reference registry is far below this). */
const MAX_CODE_HEX = 2 * 24_576 + 2;

/**
 * Fails closed unless the canonical registry address holds contract code on the client's chain. The code hash is not
 * pinned (no independently verified hash is available); callers must keep showing the address to the user.
 */
export async function assertRegistryDeployed(client: Pick<RpcClient, 'request'>): Promise<void> {
  const code = await client.request('eth_getCode', [ERC6538_REGISTRY_ADDRESS, 'latest']);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code) || code.length > MAX_CODE_HEX) {
    return fail('RPC_FAILURE', 'malformed eth_getCode result');
  }
  if (code === '0x') return fail('CHAIN_DISABLED', 'ERC-6538 registry has no code on this chain');
}

/**
 * Looks up a registrant's scheme-1 meta-address. Returns `undefined` when none is registered. A malformed stored
 * value (wrong length, off-curve keys) throws rather than being shown. Always checks the registry has code first.
 */
export async function lookupMetaAddress(client: Pick<RpcClient, 'request'>, registrant: string): Promise<string | undefined> {
  const call = buildLookupCall(registrant);
  await assertRegistryDeployed(client);
  const res = await client.request('eth_call', [{ to: call.to, data: call.data }, 'latest']);
  if (typeof res !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(res) || res.length > 2 + 2 * 1024) {
    return fail('RPC_FAILURE', 'malformed eth_call result');
  }
  let bytes: Hex;
  try {
    [bytes] = decodeAbiParameters([{ type: 'bytes' }], res as Hex);
  } catch {
    return fail('RPC_FAILURE', 'registry answer is not ABI-encoded bytes');
  }
  if (bytes === '0x') return undefined;
  return registryBytesToMetaAddress(bytes);
}

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
  const data = encodeFunctionData({ abi: referenceRegistryAbi, functionName: 'ERC6538REGISTRY_ENTRY_TYPE_HASH' });
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
  let d: ReturnType<typeof decodeFunctionData<typeof referenceRegistryAbi>>;
  try {
    d = decodeFunctionData({ abi: referenceRegistryAbi, data: tx.data });
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
