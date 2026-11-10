import type { ChainConfig, RpcClient, RpcLog } from '@ghostpay/chain-adapters';
import { parseQuantity } from '@ghostpay/chain-adapters';
import {
  ZERO_ADDRESS, encodeExecuteWithdraw, getLimitProof, policyAccountAbi, predictAccountAddress, windowHeadroom, UNLIMITED,
  type Address, type CallRequest, type Hex, type PolicyRecord,
} from '@ghostpay/policy-scheme';
import type { Abi } from 'viem';
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, keccak256, toBytes } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';
import type { SessionPublic } from '../../lib/session';
import { readAccount, readBalance, readNonceUsed, readWindow, verifyPolicyDeployment, type AccountView, type PolicyChainDeployment } from './chain';
import { assertPolicyChain, assertCanonicalPolicyBlock, type AuthenticatedPolicyDeployment, type CanonicalPolicyBlock, type PolicyBlockSelector } from './deploymentEvidence';
import { summarizeAccount, type AccountEvent, type AccountSummary } from './guard';
import { planWithdraw, type WithdrawPlan } from './withdraw';

const HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_PAGES = 50;
const MAX_EVENTS = 256;
const MAX_LOG_DATA = 1024;
const noHistory = (): never => { throw new UserFacingError({ key: 'policy.withdraw.historyUnavailable' }); };
const changed = (): never => { throw new UserFacingError({ key: 'policy.withdraw.stateChanged' }); };
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

type Stored = { readonly token: Address; readonly status: number; readonly executeAfter: bigint; readonly windowSeconds: bigint; readonly amount: bigint; readonly limit: bigint };
interface ObservedRequest { readonly id: Hex; readonly token: Address; readonly amount: bigint; readonly executeAfter: bigint; readonly destination: Address; status: number }
interface OrderedEvent { readonly event: AccountEvent; readonly index: bigint; readonly raw: RpcLog }

/** The normal EIP-1167 runtime, including the authenticated implementation, not its creation prefix. */
export function policyCloneRuntime(implementation: Address): Hex {
  return `0x363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}

/** A stable privacy-minimised journal scope; it contains no private key, signature or raw invoice. */
export function withdrawalActionScope(session: SessionPublic, deployment: PolicyChainDeployment, account: Address, token: Address): string {
  return keccak256(toBytes(JSON.stringify([
    'GhostPay/policy-withdrawal/v1', deployment.chainId,
    session.spendingPublicKey.toLowerCase(), session.viewingPublicKey.toLowerCase(),
    deployment.factory.toLowerCase(), deployment.implementation.toLowerCase(), deployment.router.toLowerCase(),
    deployment.announcer.toLowerCase(), deployment.feeRecipient.toLowerCase(), deployment.flatFee.toString(),
    account.toLowerCase(), token.toLowerCase(),
  ])));
}

function decode(log: RpcLog, account: Address, from: bigint, to: bigint): OrderedEvent {
  try {
    const block = parseQuantity(log.blockNumber);
    const index = parseQuantity(log.logIndex);
    if (!same(log.address, account) || log.removed === true || block < from || block > to || !HASH.test(log.blockHash) || typeof log.transactionHash !== 'string' || !HASH.test(log.transactionHash) || log.data.length > MAX_LOG_DATA || log.topics.length > 4) return noHistory();
    const d = decodeEventLog({ abi: policyAccountAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex, strict: true });
    const a = d.args as unknown as Record<string, unknown>;
    const id = a['id'];
    if (typeof id !== 'string' || !HASH.test(id)) return noHistory();
    const base = { id: id.toLowerCase() as Hex, block };
    let event: AccountEvent;
    switch (d.eventName) {
      case 'WithdrawRequested': event = { ...base, kind: d.eventName, token: getAddress(a['token'] as string), amount: a['amount'] as bigint, executeAfter: a['executeAfter'] as bigint }; break;
      case 'WithdrawExecuted':
      case 'WithdrawCancelled':
      case 'DestinationChangeCancelled': event = { ...base, kind: d.eventName }; break;
      case 'DestinationProposed': event = { ...base, kind: d.eventName, newDestination: getAddress(a['newDestination'] as string), effectiveAt: a['effectiveAt'] as bigint }; break;
      case 'DestinationChanged': event = { ...base, kind: d.eventName, newDestination: getAddress(a['newDestination'] as string) }; break;
      default: return noHistory();
    }
    return { event, index, raw: log };
  } catch { return noHistory(); }
}

async function call(client: RpcClient, account: Address, name: 'requests' | 'requestDestination' | 'pendingProposalId', args: readonly unknown[], block: PolicyBlockSelector): Promise<unknown> {
  const abi: Abi = policyAccountAbi;
  const data = encodeFunctionData({ abi, functionName: name, args });
  const answer = await client.request('eth_call', [{ to: account, data }, block]);
  if (typeof answer !== 'string') return noHistory();
  try { return decodeFunctionResult({ abi: policyAccountAbi, functionName: name, data: answer as Hex }); } catch { return noHistory(); }
}

/**
 * Full bounded history since the authenticated factory origin, never since a later payment announcement.
 * Every event is tied to a successful canonical receipt and read back from account storage at the anchor.
 * Like all RPC reads this still trusts the configured provider to return complete getLogs pages.
 */
export async function recoverWithdrawalHistory(p: {
  readonly client: RpcClient; readonly chain: ChainConfig; readonly account: Address;
  readonly fromBlock: bigint; readonly block: CanonicalPolicyBlock; readonly view: Extract<AccountView, { deployed: true }>;
  readonly record: PolicyRecord; readonly knownIds: ReadonlySet<string>; readonly assertCurrent: () => void;
}): Promise<{ readonly summary: AccountSummary; readonly requests: readonly ObservedRequest[] }> {
  const { client, account, block, assertCurrent } = p;
  assertCurrent();
  await assertPolicyChain(client, p.chain.chainId); assertCurrent();
  if (client.chainId !== p.chain.chainId || p.fromBlock < 0n || p.fromBlock > block.number) return noHistory();
  const range = p.chain.getLogsMaxRange;
  if (!Number.isSafeInteger(range) || range < 1) return noHistory();
  const step = BigInt(range);
  if ((block.number - p.fromBlock) / step + 1n > BigInt(MAX_PAGES)) return noHistory();
  const ordered: OrderedEvent[] = [];
  for (let from = p.fromBlock; from <= block.number; from += step) {
    assertCurrent();
    const to = from + step - 1n < block.number ? from + step - 1n : block.number;
    const logs = await client.getLogs({ address: account, topics: [], fromBlock: from, toBlock: to });
    assertCurrent();
    if (ordered.length + logs.length > MAX_EVENTS) return noHistory();
    for (const log of logs) ordered.push(decode(log, account, from, to));
  }
  ordered.sort((a, b) => a.event.block < b.event.block ? -1 : a.event.block > b.event.block ? 1 : a.index < b.index ? -1 : a.index > b.index ? 1 : 0);
  const identities = new Set<string>();
  const verifiedBlocks = new Map<bigint, Hex>();
  const receipts = new Map<string, Record<string, unknown>>();
  for (const o of ordered) {
    const key = `${o.event.block}:${o.index}`;
    if (identities.has(key)) return noHistory();
    identities.add(key);
    let canonicalHash = verifiedBlocks.get(o.event.block);
    if (canonicalHash === undefined) {
      const canonical = await client.getBlock(o.event.block); assertCurrent();
      if (canonical === null || canonical.number !== o.event.block) return noHistory();
      canonicalHash = canonical.hash; verifiedBlocks.set(o.event.block, canonicalHash);
    }
    if (!same(canonicalHash, o.raw.blockHash)) return noHistory();
    const txHash = o.raw.transactionHash!.toLowerCase();
    let receipt = receipts.get(txHash);
    if (receipt === undefined) {
      const result = await client.request('eth_getTransactionReceipt', [txHash]); assertCurrent();
      if (typeof result !== 'object' || result === null || Array.isArray(result)) return noHistory();
      receipt = result as Record<string, unknown>; receipts.set(txHash, receipt);
    }
    if (receipt['status'] !== '0x1' || receipt['blockNumber'] !== o.raw.blockNumber || typeof receipt['blockHash'] !== 'string' || !same(receipt['blockHash'], canonicalHash) || typeof receipt['transactionHash'] !== 'string' || !same(receipt['transactionHash'], txHash) || !Array.isArray(receipt['logs']) || receipt['logs'].length > 4096) return noHistory();
    const hits = (receipt['logs'] as unknown[]).filter((v) => typeof v === 'object' && v !== null && (v as Record<string, unknown>)['logIndex'] === o.raw.logIndex);
    if (hits.length !== 1) return noHistory();
    const r = hits[0] as RpcLog;
    if (typeof r.address !== 'string' || typeof r.blockHash !== 'string' || typeof r.transactionHash !== 'string' || typeof r.data !== 'string' || !Array.isArray(r.topics) || !r.topics.every((topic) => typeof topic === 'string')) return noHistory();
    if (r.removed === true || !same(r.address, account) || !same(r.blockHash, o.raw.blockHash) || r.blockNumber !== o.raw.blockNumber || !same(r.transactionHash ?? '', txHash) || !same(r.data, o.raw.data) || JSON.stringify(r.topics.map((s) => s.toLowerCase())) !== JSON.stringify(o.raw.topics.map((s) => s.toLowerCase()))) return noHistory();
  }
  const requests = new Map<string, ObservedRequest>();
  let destination = p.record.policy.destination;
  let proposal: Extract<AccountEvent, { kind: 'DestinationProposed' }> | undefined;
  for (const { event: e } of ordered) {
    if (e.kind === 'WithdrawRequested') {
      if (requests.has(e.id) || e.amount <= 0n) return noHistory();
      requests.set(e.id, { ...e, destination, status: 1 });
    } else if (e.kind === 'WithdrawExecuted' || e.kind === 'WithdrawCancelled') {
      const request = requests.get(e.id);
      if (request === undefined || request.status !== 1) return noHistory();
      request.status = e.kind === 'WithdrawExecuted' ? 2 : 3;
    } else if (e.kind === 'DestinationProposed') {
      if (proposal !== undefined) return noHistory();
      proposal = e;
    } else if (e.kind === 'DestinationChanged') {
      if (proposal?.id !== e.id || !same(proposal.newDestination, e.newDestination)) return noHistory();
      destination = e.newDestination; proposal = undefined;
    } else {
      if (proposal?.id !== e.id) return noHistory();
      proposal = undefined;
    }
  }
  if (!same(destination, p.view.destination) || !same(proposal?.newDestination ?? ZERO_ADDRESS, p.view.pendingDestination) || (proposal?.effectiveAt ?? 0n) !== p.view.pendingEffectiveAt) return noHistory();
  const selector = { blockHash: block.hash, requireCanonical: true } as const;
  const proposalId = await call(client, account, 'pendingProposalId', [], selector); assertCurrent();
  if (typeof proposalId !== 'string' || !same(proposalId, proposal?.id ?? `0x${'0'.repeat(64)}`)) return noHistory();
  for (const request of requests.values()) {
    const [stored, capturedDestination] = await Promise.all([
      call(client, account, 'requests', [request.id], selector),
      call(client, account, 'requestDestination', [request.id], selector),
    ]); assertCurrent();
    const s = stored as Stored;
    const expectedLimit = p.record.tree === null ? { limit: UNLIMITED, windowSeconds: 0n } : getLimitProof(p.record.tree, request.token);
    if (typeof s !== 'object' || s === null || !same(s.token, request.token) || s.status !== request.status || s.amount !== request.amount || s.executeAfter !== request.executeAfter || s.limit !== expectedLimit.limit || s.windowSeconds !== expectedLimit.windowSeconds || typeof capturedDestination !== 'string' || !same(capturedDestination, request.destination)) return noHistory();
  }
  await assertCanonicalPolicyBlock(client, block); assertCurrent();
  await assertPolicyChain(client, p.chain.chainId); assertCurrent();
  return { summary: summarizeAccount(ordered.map((o) => o.event), p.knownIds, p.record.policy.destination), requests: [...requests.values()] };
}

export interface WithdrawalSnapshot {
  readonly deployment: AuthenticatedPolicyDeployment;
  readonly block: CanonicalPolicyBlock;
  readonly account: Address;
  readonly token: Address;
  readonly view: AccountView;
  readonly balance: bigint;
  readonly plan: WithdrawPlan;
  readonly summary: AccountSummary;
  readonly requests: readonly ObservedRequest[];
  readonly window: Awaited<ReturnType<typeof readWindow>>;
}

/** Fresh, coherent state: no cached UI plan or imported file authorizes a signature. */
export async function readWithdrawalSnapshot(p: {
  readonly client: RpcClient; readonly chain: ChainConfig; readonly deployment: PolicyChainDeployment;
  readonly account: Address; readonly owner: Address; readonly record: PolicyRecord; readonly token: Address;
  readonly knownIds: ReadonlySet<string>; readonly assertCurrent: () => void; readonly nonce?: bigint;
}): Promise<WithdrawalSnapshot> {
  const { client, account, assertCurrent } = p;
  assertCurrent();
  if (!('profile' in p.deployment) || !('canonicalBlock' in p.deployment)) throw new UserFacingError({ key: 'policy.withdraw.unverifiedDeployment' });
  const prior = p.deployment as AuthenticatedPolicyDeployment;
  const deployment = await verifyPolicyDeployment(client, p.chain, { factory: prior.factory, router: prior.router }, prior.profile); assertCurrent();
  if (!deployment.profile.assets.some((a) => same(a.token, p.token))) return changed();
  const block = deployment.canonicalBlock;
  const selector = { blockHash: block.hash, requireCanonical: true } as const;
  if (!same(predictAccountAddress(deployment, p.owner, p.record.policyHash), account)) return changed();
  const code = await client.request('eth_getCode', [account, selector]); assertCurrent();
  const deployed = code !== '0x';
  if (deployed && (typeof code !== 'string' || !same(code, policyCloneRuntime(deployment.implementation)))) return changed();
  const [view, balance, window] = await Promise.all([
    readAccount(client, account, selector), readBalance(client, account, p.token, selector),
    deployed ? readWindow(client, account, p.token, selector) : Promise.resolve({ window: 0n, bucket: 0n, current: 0n, previous: 0n }),
  ]); assertCurrent();
  if (view.deployed !== deployed) return changed();
  if (view.deployed && (!same(view.owner, p.owner) || view.delay !== p.record.policy.delaySeconds || !same(view.limitsRoot, p.record.policy.limitsRoot) || !same(view.policyHash, p.record.policyHash))) return changed();
  const history = view.deployed ? await recoverWithdrawalHistory({ ...p, block, view, fromBlock: deployment.profile.deploymentStartBlock }) : { summary: { pending: [], alerts: [] }, requests: [] };
  assertCurrent();
  if (p.nonce !== undefined && await readNonceUsed(client, account, p.nonce, selector)) throw new UserFacingError({ key: 'policy.withdraw.nonceUsed' });
  assertCurrent();
  const pendingSameToken = history.summary.pending.filter((r) => same(r.token, p.token)).reduce((sum, r) => sum + r.amount, 0n);
  const plan = planWithdraw({ record: p.record, view, token: p.token, balance, window, pendingSameToken, nowSec: block.timestamp });
  await assertCanonicalPolicyBlock(client, block); assertCurrent();
  await assertPolicyChain(client, p.chain.chainId); assertCurrent();
  return { deployment, block, account, token: p.token, view, balance, window, plan, ...history };
}

/** Only a recovered pending request can be executed; transaction submission never creates one locally. */
export function recoveredExecution(snapshot: WithdrawalSnapshot, id: Hex): CallRequest {
  const r = snapshot.requests.find((x) => same(x.id, id));
  if (r === undefined || r.status !== 1 || !snapshot.view.deployed || !same(r.destination, snapshot.view.destination) || snapshot.view.pendingDestination !== ZERO_ADDRESS || snapshot.block.timestamp < r.executeAfter || r.amount > snapshot.balance || !same(r.token, snapshot.token)) throw new UserFacingError({ key: 'policy.withdraw.notReady' });
  const proof = snapshot.plan.proof;
  if (snapshot.plan.problems.length > 0 || (snapshot.plan.limit !== null && (proof === null || (proof.limit !== UNLIMITED && r.amount > windowHeadroom(snapshot.window, proof, snapshot.block.timestamp))))) throw new UserFacingError({ key: 'policy.withdraw.notReady' });
  return encodeExecuteWithdraw(snapshot.account, id);
}

// i18n-use: policy.withdraw.historyUnavailable policy.withdraw.stateChanged policy.withdraw.unverifiedDeployment policy.withdraw.nonceUsed policy.withdraw.notReady
