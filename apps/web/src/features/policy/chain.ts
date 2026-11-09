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
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, keccak256 } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';
import { assertCanonicalPolicyBlock, assertPolicyChain, captureCanonicalPolicyBlock, invalidPolicyEvidence, policyBlockSelector, POLICY_HASH_RE, type AuthenticatedPolicyDeployment, type PolicyBlockSelector, type PolicyDeploymentProfile } from './deploymentEvidence';

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
export const PINNED_POLICY_DEPLOYMENTS: Readonly<Record<string, PolicyDeploymentProfile>> = Object.freeze({});

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/** `eth_call` at latest; refuses non-hex answers. */
export async function ethCall(client: RpcClient, to: Address, data: Hex, block: PolicyBlockSelector = 'latest'): Promise<Hex> {
  const r = await client.request('eth_call', [{ to, data }, block]);
  if (typeof r !== 'string' || !HEX_RE.test(r)) throw new UserFacingError('The RPC returned a malformed eth_call result.');
  return r as Hex;
}

async function read(client: RpcClient, abi: Abi, to: Address, functionName: string, args: readonly unknown[] = [], block: PolicyBlockSelector = 'latest'): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args });
  const out = await ethCall(client, to, data, block);
  try {
    return decodeFunctionResult({ abi, functionName, data: out });
  } catch {
    throw new UserFacingError(`The contract at ${to} did not answer ${functionName}() as expected.`);
  }
}

async function hasCode(client: RpcClient, a: Address, block: PolicyBlockSelector = 'latest'): Promise<boolean> {
  const code = await client.request('eth_getCode', [a, block]);
  return typeof code === 'string' && HEX_RE.test(code) && code.length > 2;
}

function addressInput(v: string, label: string): Address {
  const t = v.trim();
  if (!isAddress(t, { strict: true }) || getAddress(t) === ZERO_ADDRESS) throw new UserFacingError(`${label} is not a valid checksummed address.`);
  return getAddress(t);
}

/**
 * Authenticate an explicitly trusted testnet profile at one canonical block. The fourth argument is
 * dependency injection for local fixtures, NOT a user-supplied configuration or an RPC-derived pin.
 * No production profile is shipped: pasted getter-compatible contracts therefore fail closed.
 */
export async function verifyPolicyDeployment(
  client: RpcClient,
  chain: ChainConfig,
  input: { readonly factory: string; readonly router: string },
  trustedProfile?: PolicyDeploymentProfile,
  blockNumber?: bigint,
): Promise<AuthenticatedPolicyDeployment> {
  if (!chain.testnet) throw new UserFacingError('Policy accounts are experimental: only test networks are allowed.');
  if (!chain.enabled) throw invalidPolicyEvidence();
  if (client.chainId !== chain.chainId) throw new UserFacingError('The RPC is on a different chain.');
  const factory = addressInput(input.factory, 'Factory');
  const router = addressInput(input.router, 'Router');
  const source = trustedProfile ?? PINNED_POLICY_DEPLOYMENTS[String(chain.chainId)];
  if (source === undefined) throw new UserFacingError({ key: 'policy.deployment.untrusted' });
  // Copy public trust data before the first await so a caller cannot mutate a verification in flight.
  const profile: PolicyDeploymentProfile = Object.freeze({
    ...source,
    deployment: Object.freeze({ ...source.deployment }),
    codeHashes: Object.freeze({ ...source.codeHashes }),
    assets: Object.freeze(source.assets.map((asset) => Object.freeze({ ...asset }))),
  });
  const expected = profile.deployment;
  if (expected.chainId !== chain.chainId || getAddress(expected.factory) !== factory || getAddress(expected.router) !== router
    || profile.deploymentStartBlock < 0n || profile.assets.length > 32 || profile.assets.length === 0) throw invalidPolicyEvidence();
  const uniqueAssets = new Set<string>();
  for (const asset of profile.assets) {
    const address = getAddress(asset.token);
    if (uniqueAssets.has(address) || (asset.semantics === 'native' ? address !== ZERO_ADDRESS : address === ZERO_ADDRESS || !POLICY_HASH_RE.test(asset.codeHash))) throw invalidPolicyEvidence();
    uniqueAssets.add(address);
  }
  await assertPolicyChain(client, chain.chainId);
  const block = await captureCanonicalPolicyBlock(client, blockNumber);
  if (block.number < profile.deploymentStartBlock) throw invalidPolicyEvidence();
  const selector = policyBlockSelector(block);
  const authenticatedCode = async (address: Address, hash: Hex): Promise<void> => {
    if (!POLICY_HASH_RE.test(hash) || getAddress(address) === ZERO_ADDRESS) throw invalidPolicyEvidence();
    const code = await client.request('eth_getCode', [address, selector]);
    // EIP-170 limits deployed code to 24,576 bytes. Oversized/malformed responses fail closed.
    if (typeof code !== 'string' || code.length <= 2 || code.length > 49_154 || !HEX_RE.test(code)
      || keccak256(code as Hex).toLowerCase() !== hash.toLowerCase()) throw invalidPolicyEvidence();
  };
  await Promise.all((['factory', 'router', 'implementation', 'announcer'] as const).map((name) => authenticatedCode(expected[name], profile.codeHashes[name])));
  await Promise.all(profile.assets.map((asset) => asset.semantics === 'native' ? Promise.resolve() : authenticatedCode(asset.token, asset.codeHash)));
  const check = async (abi: Abi, address: Address, name: string, value: unknown): Promise<void> => {
    const answer = await read(client, abi, address, name, [], selector);
    if (typeof value === 'string' ? typeof answer !== 'string' || answer.toLowerCase() !== value.toLowerCase() : answer !== value) throw invalidPolicyEvidence();
  };
  await Promise.all([
    check(ghostPayPolicyRouterAbi, router, 'FACTORY', factory),
    check(ghostPayPolicyRouterAbi, router, 'SCHEME_ID', SCHEME_ID),
    check(ghostPayPolicyRouterAbi, router, 'FEE_BPS', POLICY_ROUTER_FEE_BPS),
    check(ghostPayPolicyRouterAbi, router, 'BPS', 10_000n),
    check(ghostPayPolicyRouterAbi, router, 'NATIVE', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
    check(ghostPayPolicyRouterAbi, router, 'FEE_RECIPIENT', expected.feeRecipient),
    check(ghostPayPolicyRouterAbi, router, 'ANNOUNCER', expected.announcer),
    check(policyAccountFactoryAbi, factory, 'IMPLEMENTATION', expected.implementation),
    check(policyAccountFactoryAbi, factory, 'FLAT_FEE', expected.flatFee),
    check(policyAccountFactoryAbi, factory, 'FEE_TOKEN', profile.factoryFeeToken),
    check(policyAccountFactoryAbi, factory, 'FEE_RECIPIENT', profile.factoryFeeRecipient),
  ]);
  await assertCanonicalPolicyBlock(client, block);
  await assertPolicyChain(client, chain.chainId);
  return Object.freeze({ ...expected, factory, router, profile, canonicalBlock: block });
}

// i18n-use: policy.deployment.untrusted

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

export async function readAccount(client: RpcClient, account: Address, block: PolicyBlockSelector = 'latest'): Promise<AccountView> {
  if (!(await hasCode(client, account, block))) return { deployed: false };
  const names = ['owner', 'destination', 'delay', 'limitsRoot', 'policyHash', 'pendingDestination', 'pendingEffectiveAt'] as const;
  const v = await Promise.all(names.map((n) => read(client, policyAccountAbi, account, n, [], block)));
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

export async function readWindow(client: RpcClient, account: Address, token: Address, block: PolicyBlockSelector = 'latest'): Promise<WindowState> {
  const r = (await read(client, policyAccountAbi, account, 'windowState', [token], block)) as readonly [bigint, bigint, bigint, bigint];
  return { window: BigInt(r[0]), bucket: BigInt(r[1]), current: r[2], previous: r[3] };
}

export async function readNonceUsed(client: RpcClient, account: Address, nonce: bigint, block: PolicyBlockSelector = 'latest'): Promise<boolean> {
  return (await read(client, policyAccountAbi, account, 'nonceUsed', [nonce], block)) === true;
}

export async function readBalance(client: RpcClient, holder: Address, token: Address, block: PolicyBlockSelector = 'latest'): Promise<bigint> {
  if (token === ZERO_ADDRESS) {
    const r = await client.request('eth_getBalance', [holder, block]);
    if (typeof r !== 'string' || !/^0x[0-9a-fA-F]+$/.test(r)) throw new UserFacingError('The RPC returned a malformed balance.');
    return BigInt(r);
  }
  const v = await read(client, erc20Abi, token, 'balanceOf', [holder], block);
  if (typeof v !== 'bigint') throw new UserFacingError('The token returned a malformed balance.');
  return v;
}

/** Latest block timestamp (seconds). */
export async function chainNow(client: RpcClient): Promise<bigint> {
  const b = (await client.request('eth_getBlockByNumber', ['latest', false])) as { timestamp?: unknown } | null;
  if (b === null || typeof b.timestamp !== 'string' || !/^0x[0-9a-fA-F]+$/.test(b.timestamp)) throw new UserFacingError('The RPC returned a malformed block.');
  return BigInt(b.timestamp);
}
