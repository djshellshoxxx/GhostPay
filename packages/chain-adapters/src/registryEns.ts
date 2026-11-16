import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, toHex } from 'viem/utils';
import { namehash, normalize, packetToBytes } from 'viem/ens';
import { fail } from './errors.js';
import { buildLookupCall } from './registry.js';
import type { RpcClient } from './rpc.js';
import type { Address, Hex } from './types.js';

/** Canonical ENS Universal Resolver proxy on Ethereum and Sepolia (ENSIP-23; official deployment documentation). */
const UNIVERSAL_RESOLVER: Address = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee';
const resolveAbi = [{
  type: 'function', name: 'resolveWithGateways', stateMutability: 'view',
  inputs: [{ type: 'bytes' }, { type: 'bytes' }, { type: 'string[]' }],
  outputs: [{ type: 'bytes' }, { type: 'address' }],
}] as const;
const addressAbi = [{
  type: 'function', name: 'addr', stateMutability: 'view',
  inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }],
}] as const;

/** The address to review before an ERC-6538 lookup, plus the normalized ENS name when one was supplied. */
export interface RegistryRegistrant {
  readonly registrant: Address;
  readonly name?: string;
}

/**
 * Resolve an address or ENS name using only the explicitly selected, verified RPC client.
 *
 * ENS uses the canonical Universal Resolver on Ethereum or Sepolia. Other chains need an explicit cross-chain
 * resolution design and are refused; there is no fallback RPC. An empty gateway list and no CCIP Read interpreter
 * keep offchain responses inert. Pure viem name/ABI utilities avoid importing default providers or transport code.
 * A resolver code-presence probe is not a verified runtime hash.
 * The caller must still validate the ERC-6538 deployment and its returned meta-address, then show the registrant.
 * Sources: https://docs.ens.domains/resolvers/universal/ and https://docs.ens.domains/ensip/23/
 */
export async function resolveRegistryRegistrant(client: Pick<RpcClient, 'chainId' | 'request'>, input: string): Promise<RegistryRegistrant> {
  if (input.startsWith('0x')) {
    return { registrant: buildLookupCall(input).preview.registrant! };
  }
  if (input.length === 0 || input.length > 1024 || !input.includes('.')) {
    return fail('INVALID_INPUT', 'enter a wallet address or ENS name');
  }
  let name: string;
  try {
    name = normalize(input);
  } catch {
    return fail('INVALID_INPUT', 'invalid ENS name');
  }
  if (new TextEncoder().encode(name).length > 255) return fail('INVALID_INPUT', 'ENS name exceeds the lookup limit');
  if (client.chainId !== 1 && client.chainId !== 11155111) return fail('CHAIN_DISABLED', 'ENS lookup requires the selected Ethereum or Sepolia RPC');
  const code = await client.request('eth_getCode', [UNIVERSAL_RESOLVER, 'latest']);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || code.length > 2 + 2 * 24_576) {
    return fail('DEPLOYMENT_UNVERIFIED', 'ENS Universal Resolver is unavailable');
  }
  let registrant: Address;
  try {
    const data = encodeFunctionData({
      abi: resolveAbi,
      functionName: 'resolveWithGateways',
      args: [toHex(packetToBytes(name)), encodeFunctionData({ abi: addressAbi, functionName: 'addr', args: [namehash(name)] }), []],
    });
    const result = await client.request('eth_call', [{ to: UNIVERSAL_RESOLVER, data }, 'latest']);
    if (typeof result !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result) || result.length > 2 + 2 * 4096) {
      return fail('RPC_FAILURE', 'malformed ENS lookup answer');
    }
    const [record] = decodeFunctionResult({ abi: resolveAbi, functionName: 'resolveWithGateways', data: result as Hex });
    [registrant] = decodeAbiParameters([{ type: 'address' }], record);
  } catch {
    return fail('RPC_FAILURE', 'ENS lookup failed or requires an offchain gateway');
  }
  if (registrant === '0x0000000000000000000000000000000000000000') return fail('INVALID_INPUT', 'ENS name has no address on the selected network');
  return { registrant: buildLookupCall(registrant).preview.registrant!, name };
}
