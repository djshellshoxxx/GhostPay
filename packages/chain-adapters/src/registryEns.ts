import { createPublicClient, custom } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import { fail } from './errors.js';
import { buildLookupCall } from './registry.js';
import type { RpcClient } from './rpc.js';
import type { Address } from './types.js';

/** The address to review before an ERC-6538 lookup, plus the normalized ENS name when one was supplied. */
export interface RegistryRegistrant {
  readonly registrant: Address;
  readonly name?: string;
}

/**
 * Resolve an address or ENS name using only the explicitly selected, verified RPC client.
 *
 * ENS uses the pinned viem package's Universal Resolver on Ethereum or Sepolia. Other chains need an explicit
 * cross-chain resolution design and are refused; there is no fallback RPC. CCIP Read is disabled so an ENS record
 * cannot cause requests to a third-party gateway. A resolver code-presence probe is not a verified runtime hash.
 * The caller must still validate the ERC-6538 deployment and its returned meta-address, then show the registrant.
 * Sources: https://docs.ens.domains/resolution/ and https://viem.sh/docs/clients/public#ccipread-optional
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
  const chain = client.chainId === mainnet.id ? mainnet : client.chainId === sepolia.id ? sepolia : undefined;
  if (chain === undefined) return fail('CHAIN_DISABLED', 'ENS lookup requires the selected Ethereum or Sepolia RPC');
  const code = await client.request('eth_getCode', [chain.contracts.ensUniversalResolver.address, 'latest']);
  if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || code.length > 2 + 2 * 24_576) {
    return fail('DEPLOYMENT_UNVERIFIED', 'ENS Universal Resolver is unavailable');
  }
  const ens = createPublicClient({
    chain,
    ccipRead: false,
    transport: custom({
      request: async ({ method, params }: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown> => {
        if (method !== 'eth_call') return fail('RPC_FAILURE', 'unexpected ENS lookup request');
        const result = await client.request(method, params ?? []);
        if (typeof result !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result) || result.length > 2 + 2 * 4096) {
          return fail('RPC_FAILURE', 'malformed ENS lookup answer');
        }
        return result;
      },
    }, { retryCount: 0 }),
  });
  let registrant: Address | null;
  try {
    registrant = await ens.getEnsAddress({ name, gatewayUrls: [], strict: true });
  } catch {
    return fail('RPC_FAILURE', 'ENS lookup failed or requires an offchain gateway');
  }
  if (registrant === null) return fail('INVALID_INPUT', 'ENS name has no address on the selected network');
  return { registrant: buildLookupCall(registrant).preview.registrant!, name };
}
