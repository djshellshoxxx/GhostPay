import type { ParsedMetadata } from '@ghostpay/core-crypto';
import { keccak256, toBytes } from 'viem/utils';
import { findToken } from './config/tokens.js';
import type { ScannedAnnouncement } from './logs.js';
import type { RpcClient, RpcLog } from './rpc.js';
import type { Address, Hex } from './types.js';

/** `keccak256("Transfer(address,address,uint256)")`: ERC-20 topic 0. */
export const TRANSFER_TOPIC: Hex = keccak256(toBytes('Transfer(address,address,uint256)'));

/** Why an announced amount could not be confirmed. */
export type ClaimedReason =
  | 'no_metadata'
  | 'native_unverifiable'
  | 'token_not_allowlisted'
  | 'no_transfer_found'
  | 'verification_failed'
  | 'not_checked';

/**
 * How trustworthy the amount of a detected payment is.
 *
 * - `verified`: confirmed either by the manifest router (which enforces metadata == transfer) or by ERC-20
 *   `Transfer` logs to the stealth address in the announcement's block/transaction from an allowlisted token.
 * - `claimed`: the amount (if any) comes from attacker-controlled announcement metadata only. Do NOT display
 *   it as received money.
 */
export type AmountVerification =
  | { readonly status: 'verified'; readonly source: 'router' | 'transfer_logs'; readonly token: Address; readonly amount: bigint }
  | {
      readonly status: 'claimed';
      readonly reason: ClaimedReason;
      readonly claimed?: { readonly token: Address; readonly amount: bigint };
    };

/** Inputs for {@link verifyAnnouncementAmount}. */
export interface VerifyAmountInput {
  readonly client: Pick<RpcClient, 'getLogs' | 'chainId'>;
  readonly announcement: ScannedAnnouncement;
  /** Parsed metadata, or `undefined` when the metadata is not in the 57-byte layout. */
  readonly metadata: ParsedMetadata | undefined;
  /** True when the announce call came from the manifest-verified router. */
  readonly viaRouter: boolean;
  /** Token allowlist predicate; default: `config/tokens.ts` for the client's chain. */
  readonly isAllowedToken?: (token: Address) => boolean;
}

function pad32(a: string): string {
  return `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

/**
 * Decides whether the amount of a matched announcement is verified.
 *
 * @remarks Never throws: any RPC error degrades to `claimed: verification_failed`. For direct (non-router)
 * payers only ERC-20 transfers from allowlisted tokens in the announcement's own block (and transaction, when
 * the provider reported its hash) count; native-coin payments cannot be verified without archive state and
 * stay `claimed`. A malicious token can forge `Transfer` events, hence the allowlist.
 *
 * @param i Inputs.
 * @returns The verification verdict.
 */
export async function verifyAnnouncementAmount(i: VerifyAmountInput): Promise<AmountVerification> {
  const { metadata, announcement: a } = i;
  if (metadata === undefined) return { status: 'claimed', reason: 'no_metadata' };
  const claimed = { token: metadata.token, amount: metadata.netAmount };
  if (i.viaRouter) return { status: 'verified', source: 'router', token: metadata.token, amount: metadata.netAmount };
  if (metadata.kind === 'native') return { status: 'claimed', reason: 'native_unverifiable', claimed };
  const allowed = i.isAllowedToken ?? ((t: Address): boolean => findToken(i.client.chainId, t) !== undefined);
  if (!allowed(metadata.token)) return { status: 'claimed', reason: 'token_not_allowlisted', claimed };
  let logs: readonly RpcLog[];
  try {
    logs = await i.client.getLogs({
      address: metadata.token,
      topics: [TRANSFER_TOPIC, null, pad32(a.stealthAddress) as Hex],
      fromBlock: a.blockNumber,
      toBlock: a.blockNumber,
    });
  } catch {
    return { status: 'claimed', reason: 'verification_failed', claimed };
  }
  let sum = 0n;
  const seen = new Set<string>();
  for (const l of logs) {
    if (typeof l !== 'object' || l === null) continue;
    if (l.removed === true || typeof l.address !== 'string' || l.address.toLowerCase() !== metadata.token.toLowerCase()) continue;
    if (!Array.isArray(l.topics) || l.topics.length !== 3) continue;
    const t = l.topics.map((x) => (typeof x === 'string' ? x.toLowerCase() : ''));
    if (t[0] !== TRANSFER_TOPIC || t[2] !== pad32(a.stealthAddress)) continue;
    if (typeof l.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(l.data)) continue;
    if (typeof l.blockHash !== 'string' || l.blockHash.toLowerCase() !== a.blockHash.toLowerCase()) continue;
    if (a.transactionHash !== undefined && l.transactionHash?.toLowerCase() !== a.transactionHash) continue;
    const key = `${l.blockHash}:${String(l.logIndex)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += BigInt(l.data);
  }
  if (sum === 0n) return { status: 'claimed', reason: 'no_transfer_found', claimed };
  return { status: 'verified', source: 'transfer_logs', token: metadata.token, amount: sum };
}

