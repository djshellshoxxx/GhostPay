import type { RpcClient } from '@ghostpay/chain-adapters';
import type { Address, Hex } from '@ghostpay/policy-scheme';
import { UserFacingError } from '../../lib/errors';
import type { PolicyChainDeployment } from './chain';

export type PolicyBlockSelector = 'latest' | Hex | { readonly blockHash: Hex; readonly requireCanonical: true };
export interface CanonicalPolicyBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

/** Trusted application input, never a user import or values learned from the RPC being checked. */
export interface PolicyDeploymentProfile {
  readonly deployment: PolicyChainDeployment;
  readonly deploymentStartBlock: bigint;
  readonly codeHashes: Readonly<Record<'router' | 'factory' | 'implementation' | 'announcer', Hex>>;
  readonly factoryFeeToken: Address;
  readonly factoryFeeRecipient: Address;
  /** Only audited, non-proxy, exact-transfer assets belong here. Native uses the zero address. */
  readonly assets: readonly (
    | { readonly token: Address; readonly semantics: 'native' }
    | { readonly token: Address; readonly semantics: 'erc20-exact-transfer'; readonly codeHash: Hex }
  )[];
}

export interface AuthenticatedPolicyDeployment extends PolicyChainDeployment {
  readonly canonicalBlock: CanonicalPolicyBlock;
  readonly profile: PolicyDeploymentProfile;
}

export const POLICY_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const QUANTITY_RE = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/;

export function policyQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !QUANTITY_RE.test(value)) throw invalidPolicyEvidence();
  return BigInt(value);
}

export function invalidPolicyEvidence(): UserFacingError {
  return new UserFacingError({ key: 'policy.deployment.invalid' });
}

export function stalePolicyEvidence(): UserFacingError {
  return new UserFacingError({ key: 'policy.deployment.stale' });
}

export async function assertPolicyChain(client: RpcClient, chainId: number): Promise<void> {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || client.chainId !== chainId
    || policyQuantity(await client.request('eth_chainId', [])) !== BigInt(chainId)) throw stalePolicyEvidence();
}

/** Capture once; every read in the operation must use blockHash + requireCanonical. */
export async function captureCanonicalPolicyBlock(client: RpcClient, blockNumber?: bigint): Promise<CanonicalPolicyBlock> {
  if (blockNumber !== undefined && (blockNumber < 0n || blockNumber >= 2n ** 256n)) throw invalidPolicyEvidence();
  const tag = blockNumber === undefined ? 'latest' : `0x${blockNumber.toString(16)}`;
  const raw = await client.request('eth_getBlockByNumber', [tag, false]);
  if (raw === null || typeof raw !== 'object') throw invalidPolicyEvidence();
  const b = raw as Record<string, unknown>;
  const number = policyQuantity(b['number']);
  const timestamp = policyQuantity(b['timestamp']);
  if (typeof b['hash'] !== 'string' || !POLICY_HASH_RE.test(b['hash']) || (blockNumber !== undefined && number !== blockNumber)) throw invalidPolicyEvidence();
  return Object.freeze({ number, timestamp, hash: b['hash'].toLowerCase() as Hex });
}

export async function assertCanonicalPolicyBlock(client: RpcClient, block: CanonicalPolicyBlock): Promise<void> {
  const current = await captureCanonicalPolicyBlock(client, block.number);
  if (current.hash !== block.hash || current.timestamp !== block.timestamp) throw stalePolicyEvidence();
}

export function policyBlockSelector(block: CanonicalPolicyBlock): PolicyBlockSelector {
  return Object.freeze({ blockHash: block.hash, requireCanonical: true });
}

// i18n-use: policy.deployment.invalid policy.deployment.stale
