import type { ChainConfig, RpcClient } from '@ghostpay/chain-adapters';
import { erc20Abi } from '@ghostpay/chain-adapters';
import {
  POLICY_ROUTER_FEE_BPS,
  SCHEME_ID,
  ZERO_ADDRESS,
  ghostPayPolicyRouterAbi,
  policyAccountAbi,
  policyAccountFactoryAbi,
  type Address,
  type Hex,
  type PolicyDeployment,
  type WindowState,
} from '@ghostpay/policy-scheme';
import type { Abi } from 'viem';
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';

/** A policy deployment read back from the chain. Never bundled: no network has a pinned one. */
export interface PolicyChainDeployment extends PolicyDeployment {
  readonly chainId: number;
  readonly router: Address;
  readonly feeRecipient: Address;
  readonly announcer: Address;
  /** Factory `FLAT_FEE()`; a non-zero fee needs a token approval this view does not build. */
  readonly flatFee: bigint;
}

/**
 * Pinned deployments per chain id. Empty on purpose: the scheme is experimental (ADR-0014) and is not
 * enabled on any network. Adding an entry requires an audit and an ADR.
 */
export const PINNED_POLICY_DEPLOYMENTS: Readonly<Record<string, PolicyChainDeployment>> = Object.freeze({});

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/** `eth_call` at latest; refuses non-hex answers. */
export async function ethCall(client: RpcClient, to: Address, data: Hex): Promise<Hex> {
  const r = await client.request('eth_call', [{ to, data }, 'latest']);
  if (typeof r !== 'string' || !HEX_RE.test(r)) throw new UserFacingError('The RPC returned a malformed eth_call result.');
  return r as Hex;
}

async function read<const A extends Abi>(client: RpcClient, abi: A, to: Address, functionName: string, args: readonly unknown[] = []): Promise<unknown> {
  const data = encodeFunctionData({ abi: abi as Abi, functionName, args } as never);
  const out = await ethCall(client, to, data);
  try {
    return decodeFunctionResult({ abi: abi as Abi, functionName, data: out } as never) as unknown;
  } catch {
    throw new UserFacingError(`The contract at ${to} did not answer ${functionName}() as expected.`);
  }
}

async function hasCode(client: RpcClient, a: Address): Promise<boolean> {
  const code = await client.request('eth_getCode', [a, 'latest']);
  return typeof code === 'string' && HEX_RE.test(code) && code.length > 2;
}

function addressInput(v: string, label: string): Address {
  const t = v.trim();
  if (!isAddress(t, { strict: true }) || getAddress(t) === ZERO_ADDRESS) throw new UserFacingError(`${label} is not a valid checksummed address.`);
  return getAddress(t);
}

/**
 * Reads a user-supplied test deployment back from the chain: the router must report this factory and
 * scheme `0x47500002`, the fee rule the client mirrors, and every contract must have code. The
 * implementation, fee recipient and announcer come from the chain, never from user text.
 *
 * @throws {UserFacingError} on mainnets, chain mismatch, missing code or any mismatch.
 */
export async function verifyPolicyDeployment(client: RpcClient, chain: ChainConfig, input: { readonly factory: string; readonly router: string }): Promise<PolicyChainDeployment> {
  if (!chain.testnet) throw new UserFacingError('Policy accounts are experimental: only test networks are allowed.');
  if (client.chainId !== chain.chainId) throw new UserFacingError('The RPC is on a different chain.');
  const factory = addressInput(input.factory, 'Factory');
  const router = addressInput(input.router, 'Router');
  if (!(await hasCode(client, factory)) || !(await hasCode(client, router))) throw new UserFacingError('No contract code at the factory or router address.');
  const [routerFactory, scheme, feeBps, feeRecipient, announcer] = await Promise.all([
    read(client, ghostPayPolicyRouterAbi, router, 'FACTORY'),
    read(client, ghostPayPolicyRouterAbi, router, 'SCHEME_ID'),
    read(client, ghostPayPolicyRouterAbi, router, 'FEE_BPS'),
    read(client, ghostPayPolicyRouterAbi, router, 'FEE_RECIPIENT'),
    read(client, ghostPayPolicyRouterAbi, router, 'ANNOUNCER'),
  ]);
  if (typeof routerFactory !== 'string' || getAddress(routerFactory) !== factory) throw new UserFacingError('The router does not use this factory.');
  if (scheme !== SCHEME_ID) throw new UserFacingError('The router is not a scheme 0x47500002 router.');
  if (feeBps !== POLICY_ROUTER_FEE_BPS) throw new UserFacingError('The router fee differs from the fee this client computes.');
  const [implementation, flatFee] = await Promise.all([
    read(client, policyAccountFactoryAbi, factory, 'IMPLEMENTATION'),
    read(client, policyAccountFactoryAbi, factory, 'FLAT_FEE'),
  ]);
  if (typeof implementation !== 'string' || typeof feeRecipient !== 'string' || typeof announcer !== 'string' || typeof flatFee !== 'bigint') {
    throw new UserFacingError('The deployment answered with unexpected types.');
  }
  const impl = getAddress(implementation);
  const ann = getAddress(announcer);
  if (!(await hasCode(client, impl)) || !(await hasCode(client, ann))) throw new UserFacingError('No contract code at the implementation or announcer.');
  return Object.freeze({ chainId: chain.chainId, factory, implementation: impl, router, feeRecipient: getAddress(feeRecipient), announcer: ann, flatFee });
}

/** On-chain view of one account; `deployed: false` before the factory created it. */
export type AccountView =
  | { readonly deployed: false }
  | {
      readonly deployed: true;
      readonly owner: Address;
      readonly destination: Address;
      readonly delay: bigint;
      readonly limitsRoot: Hex;
      readonly policyHash: Hex;
      readonly pendingDestination: Address;
      readonly pendingEffectiveAt: bigint;
    };

export async function readAccount(client: RpcClient, account: Address): Promise<AccountView> {
  if (!(await hasCode(client, account))) return { deployed: false };
  const names = ['owner', 'destination', 'delay', 'limitsRoot', 'policyHash', 'pendingDestination', 'pendingEffectiveAt'] as const;
  const v = await Promise.all(names.map((n) => read(client, policyAccountAbi, account, n)));
  return Object.freeze({
    deployed: true,
    owner: getAddress(v[0] as string),
    destination: getAddress(v[1] as string),
    delay: BigInt(v[2] as bigint),
    limitsRoot: (v[3] as string).toLowerCase() as Hex,
    policyHash: (v[4] as string).toLowerCase() as Hex,
    pendingDestination: getAddress(v[5] as string),
    pendingEffectiveAt: BigInt(v[6] as bigint),
  });
}

export async function readWindow(client: RpcClient, account: Address, token: Address): Promise<WindowState> {
  const r = (await read(client, policyAccountAbi, account, 'windowState', [token])) as readonly [bigint, bigint, bigint, bigint];
  return { window: BigInt(r[0]), bucket: BigInt(r[1]), current: r[2], previous: r[3] };
}

export async function readNonceUsed(client: RpcClient, account: Address, nonce: bigint): Promise<boolean> {
  return (await read(client, policyAccountAbi, account, 'nonceUsed', [nonce])) === true;
}

export async function readBalance(client: RpcClient, holder: Address, token: Address): Promise<bigint> {
  if (token === ZERO_ADDRESS) {
    const r = await client.request('eth_getBalance', [holder, 'latest']);
    if (typeof r !== 'string' || !/^0x[0-9a-fA-F]+$/.test(r)) throw new UserFacingError('The RPC returned a malformed balance.');
    return BigInt(r);
  }
  const v = await read(client, erc20Abi, token, 'balanceOf', [holder]);
  if (typeof v !== 'bigint') throw new UserFacingError('The token returned a malformed balance.');
  return v;
}

/** Latest block timestamp (seconds). */
export async function chainNow(client: RpcClient): Promise<bigint> {
  const b = (await client.request('eth_getBlockByNumber', ['latest', false])) as { timestamp?: unknown } | null;
  if (b === null || typeof b.timestamp !== 'string' || !/^0x[0-9a-fA-F]+$/.test(b.timestamp)) throw new UserFacingError('The RPC returned a malformed block.');
  return BigInt(b.timestamp);
}
