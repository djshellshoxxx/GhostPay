import { ANNOUNCEMENT_TOPIC, erc20Abi, erc5564AnnouncerAbi, type ChainConfig, type RpcClient } from '@ghostpay/chain-adapters';
import { buildErc20Metadata, buildNativeMetadata } from '@ghostpay/core-crypto';
import { decodePolicyPaymentCalldata, ghostPayPolicyRouterAbi, policyRouterFee, SCHEME_ID, ZERO_ADDRESS, type Address, type Hex } from '@ghostpay/policy-scheme';
import { bytesToHex, decodeEventLog, decodeFunctionData, encodeFunctionData, getAddress } from 'viem/utils';
import { verifyPolicyDeployment } from './chain';
import { assertCanonicalPolicyBlock, assertPolicyChain, captureCanonicalPolicyBlock, POLICY_HASH_RE, policyQuantity, type PolicyDeploymentProfile } from './deploymentEvidence';
import type { Scheme2Match } from './scan2';

const MAX_RECEIPT_LOGS = 128;
const MAX_LOG_DATA_BYTES = 4096;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

export interface VerifiedPolicyPayment {
  readonly status: 'verified';
  /** One direct payment per transaction. Independent of reorg block hash. */
  readonly evidenceId: string;
  readonly announcementId: string;
  readonly chainId: number;
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly logIndex: number;
  readonly account: Address;
  readonly owner: Address;
  readonly policyHash: Hex;
  readonly payer: Address;
  readonly token: Address;
  readonly gross: bigint;
  readonly net: bigint;
}

export type PolicyPaymentEvidence = VerifiedPolicyPayment | {
  readonly status: 'unverified';
  readonly reason: 'missing-position' | 'duplicate' | 'unsupported-execution' | 'unsupported-asset' | 'insufficient-finality' | 'invalid-evidence';
};

class Refusal extends Error {
  public constructor(public readonly reason: Exclude<PolicyPaymentEvidence, VerifiedPolicyPayment>['reason']) { super(reason); }
}
function refuse(reason: Exclude<PolicyPaymentEvidence, VerifiedPolicyPayment>['reason'] = 'invalid-evidence'): never { throw new Refusal(reason); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return refuse();
  return value as Record<string, unknown>;
}
function hash(value: unknown): Hex {
  if (typeof value !== 'string' || !POLICY_HASH_RE.test(value)) return refuse();
  return value.toLowerCase() as Hex;
}
function address(value: unknown): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) return refuse();
  return getAddress(value.toLowerCase());
}
function bytes(value: unknown, maxBytes: number): Hex {
  if (typeof value !== 'string' || value.length > maxBytes * 2 + 2 || !HEX_BYTES.test(value)) return refuse();
  return value.toLowerCase() as Hex;
}

/**
 * Isolated scheme-2 evidence boundary; never changes ordinary paid/receipt/reconciliation state.
 * `profile` must be authenticated application configuration, not supplied by an invoice or RPC.
 * The only supported execution is a direct payNative/payERC20 transaction to that authenticated router.
 * Native value is established by tx.value + successful exact-code router execution, never account balance.
 * ERC-20 additionally requires exact canonical Transfer logs from a pinned non-proxy exact-transfer asset.
 */
export async function verifyPolicyPaymentEvidence(p: {
  readonly chain: ChainConfig;
  readonly client: RpcClient;
  readonly profile: PolicyDeploymentProfile;
  readonly match: Scheme2Match;
  readonly expected: { readonly token: Address; readonly net: bigint };
  readonly seenEvidenceIds: ReadonlySet<string>;
}): Promise<PolicyPaymentEvidence> {
  try {
    // Copy caller state before any await. No in-flight mutable expected value/claim may change meaning.
    const chain = { ...p.chain };
    const client = p.client;
    const match = { ...p.match };
    const expected = { ...p.expected };
    const seen = new Set(p.seenEvidenceIds);
    if (match.transactionHash === undefined || match.blockHash === undefined || match.logIndex === undefined
      || !Number.isSafeInteger(match.logIndex) || match.logIndex < 0 || match.blockNumber < 0n) return refuse('missing-position');
    const txHash = hash(match.transactionHash);
    const blockHash = hash(match.blockHash);
    const evidenceId = `${String(chain.chainId)}:${txHash}`;
    if (seen.has(evidenceId)) return refuse('duplicate');
    if (expected.net <= 0n || expected.net >= 2n ** 256n) return refuse();
    const token = address(expected.token);
    const deployment = await verifyPolicyDeployment(client, chain, { factory: p.profile.deployment.factory, router: p.profile.deployment.router }, p.profile, match.blockNumber);
    const block = deployment.canonicalBlock;
    if (block.hash !== blockHash || match.id !== `${blockHash}:${String(match.logIndex)}` || address(match.caller) !== address(deployment.router)) return refuse();
    const asset = deployment.profile.assets.find((a) => address(a.token) === token);
    if (asset === undefined) return refuse('unsupported-asset');
    const [txRaw, receiptRaw] = await Promise.all([
      client.request('eth_getTransactionByHash', [txHash]),
      client.request('eth_getTransactionReceipt', [txHash]),
    ]);
    const tx = object(txRaw);
    const receipt = object(receiptRaw);
    const payer = address(tx['from']);
    const txIndex = policyQuantity(tx['transactionIndex']);
    if (hash(tx['hash']) !== txHash || hash(receipt['transactionHash']) !== txHash
      || hash(tx['blockHash']) !== blockHash || hash(receipt['blockHash']) !== blockHash
      || policyQuantity(tx['blockNumber']) !== block.number || policyQuantity(receipt['blockNumber']) !== block.number
      || policyQuantity(receipt['transactionIndex']) !== txIndex || policyQuantity(tx['chainId']) !== BigInt(chain.chainId)
      || policyQuantity(receipt['status']) !== 1n || receipt['contractAddress'] !== null
      || address(tx['to']) !== address(deployment.router) || address(receipt['to']) !== address(deployment.router)
      || address(receipt['from']) !== payer || payer === ZERO_ADDRESS) return refuse();
    const calldata = bytes(tx['input'], 4096);
    const decoded = decodeFunctionData({ abi: ghostPayPolicyRouterAbi, data: calldata });
    if (decoded.functionName !== 'payNative' && decoded.functionName !== 'payERC20') return refuse('unsupported-execution');
    // Refuse trailing data, overlapping offsets and other ABI encodings outside our exact supported path.
    if (encodeFunctionData({ abi: ghostPayPolicyRouterAbi, functionName: decoded.functionName, args: decoded.args }).toLowerCase() !== calldata) return refuse();
    const binding = decodePolicyPaymentCalldata(calldata, deployment);
    if (address(binding.owner) !== address(match.ownerAddress) || address(binding.stealth) !== address(match.accountAddress)
      || hash(binding.policyHash) !== hash(match.policyHash) || binding.ephemeralPublicKey.toLowerCase() !== bytes(match.ephemeralPublicKey, 33)
      || binding.metadata.toLowerCase() !== bytes(match.metadata, 57)) return refuse();
    const native = decoded.functionName === 'payNative';
    const args = decoded.args;
    const value = policyQuantity(tx['value']);
    const gross = native ? value : (args[3]);
    const minNet = (native ? args[2] : args[4]) as bigint;
    const deadline = (native ? args[3] : args[5]) as bigint;
    const net = gross - policyRouterFee(gross);
    if (native ? token !== ZERO_ADDRESS || asset.semantics !== 'native' : token !== address(args[0]) || asset.semantics !== 'erc20-exact-transfer' || value !== 0n) return refuse('unsupported-asset');
    if (net !== expected.net || minNet < 1n || minNet > net || deadline < block.timestamp) return refuse();
    if (binding.metadata.length !== 116 || !/^0x0[23][0-9a-fA-F]{64}$/.test(binding.ephemeralPublicKey)) return refuse();
    const viewTag = Number.parseInt(binding.metadata.slice(2, 4), 16);
    const exactMetadata = bytesToHex(native ? buildNativeMetadata(viewTag, net) : buildErc20Metadata(viewTag, token, net));
    if (binding.metadata.toLowerCase() !== exactMetadata.toLowerCase()) return refuse();
    if (!Array.isArray(receipt['logs']) || receipt['logs'].length === 0 || receipt['logs'].length > MAX_RECEIPT_LOGS) return refuse();
    const indices = new Set<bigint>();
    let announcements = 0;
    const transfers: { from: Address; to: Address; value: bigint }[] = [];
    for (const raw of receipt['logs']) {
      const log = object(raw);
      const index = policyQuantity(log['logIndex']);
      if (indices.has(index) || index > BigInt(Number.MAX_SAFE_INTEGER) || log['removed'] === true
        || hash(log['transactionHash']) !== txHash || hash(log['blockHash']) !== blockHash
        || policyQuantity(log['blockNumber']) !== block.number || policyQuantity(log['transactionIndex']) !== txIndex) return refuse();
      indices.add(index);
      const emitter = address(log['address']);
      if (!Array.isArray(log['topics']) || log['topics'].length > 4) return refuse();
      const topics = log['topics'].map(hash) as [Hex, ...Hex[]];
      const data = bytes(log['data'], MAX_LOG_DATA_BYTES);
      if (emitter === address(deployment.announcer) && topics[0] === ANNOUNCEMENT_TOPIC.toLowerCase()) {
        announcements++;
        const event = decodeEventLog({ abi: erc5564AnnouncerAbi, eventName: 'Announcement', topics, data, strict: true });
        if (Number(index) !== match.logIndex || event.args.schemeId !== SCHEME_ID || address(event.args.caller) !== address(deployment.router)
          || address(event.args.stealthAddress) !== address(match.accountAddress) || event.args.ephemeralPubKey.toLowerCase() !== binding.ephemeralPublicKey.toLowerCase()
          || event.args.metadata.toLowerCase() !== exactMetadata.toLowerCase()) return refuse();
      } else if (!native && emitter === token) {
        // Only standard transfer logs are relevant; malformed token events fail closed.
        const event = decodeEventLog({ abi: erc20Abi, topics, data, strict: true });
        if (event.eventName === 'Transfer') transfers.push({ from: address(event.args.from), to: address(event.args.to), value: event.args.value });
      }
    }
    if (announcements !== 1) return refuse();
    if (!native) {
      const fee = gross - net;
      const required = [{ from: payer, to: address(match.accountAddress), value: net }, ...(fee === 0n ? [] : [{ from: payer, to: address(deployment.feeRecipient), value: fee }])];
      if (transfers.length !== required.length || required.some((want) => transfers.filter((got) => got.from === want.from && got.to === want.to && got.value === want.value).length !== 1)) return refuse();
    }
    const head = await captureCanonicalPolicyBlock(client);
    if (!Number.isSafeInteger(chain.finalityDepth) || chain.finalityDepth < 0 || head.number < block.number + BigInt(chain.finalityDepth)) return refuse('insufficient-finality');
    await assertCanonicalPolicyBlock(client, head);
    await assertCanonicalPolicyBlock(client, block);
    await assertPolicyChain(client, chain.chainId);
    // Advisory concurrent-consumption check, not a reservation. Consumers must atomically deduplicate
    // evidenceId when accepting results (mergePolicyPaymentEvidence provides pure deduplication).
    if (p.seenEvidenceIds.has(evidenceId)) return refuse('duplicate');
    return Object.freeze({ status: 'verified', evidenceId, announcementId: match.id, chainId: chain.chainId, transactionHash: txHash,
      blockNumber: block.number, blockHash, logIndex: match.logIndex, account: address(match.accountAddress), owner: address(match.ownerAddress),
      policyHash: hash(match.policyHash), payer, token, gross, net });
  } catch (error) {
    return Object.freeze({ status: 'unverified', reason: error instanceof Refusal ? error.reason : 'invalid-evidence' });
  }
}

/** A reorg removes affected observations before de-duplication; callers must reverify replacements. */
export function mergePolicyPaymentEvidence(
  previous: readonly VerifiedPolicyPayment[],
  next: readonly VerifiedPolicyPayment[],
  reorg?: { readonly chainId: number; readonly rolledBackTo: bigint },
): VerifiedPolicyPayment[] {
  const out = new Map<string, VerifiedPolicyPayment>();
  const kept = previous.filter((result) => reorg === undefined || result.chainId !== reorg.chainId || result.blockNumber < reorg.rolledBackTo);
  for (const result of [...kept, ...next]) {
    if (!out.has(result.evidenceId)) out.set(result.evidenceId, result);
  }
  return [...out.values()];
}

/**
 * Invalidation check for already trusted in-memory evidence only. This does not authenticate fields.
 * Imported or persisted records must run verifyPolicyPaymentEvidence again before any status reuse.
 */
export async function isPolicyEvidenceBlockCanonical(client: RpcClient, evidence: VerifiedPolicyPayment): Promise<boolean> {
  try {
    await assertPolicyChain(client, evidence.chainId);
    const block = await captureCanonicalPolicyBlock(client, evidence.blockNumber);
    await assertPolicyChain(client, evidence.chainId);
    return block.hash === evidence.blockHash;
  } catch { return false; }
}
