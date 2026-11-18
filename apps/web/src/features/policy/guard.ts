import type { ChainConfig, RpcClient } from '@ghostpay/chain-adapters';
import { policyAccountAbi, ZERO_ADDRESS, type Address, type Hex } from '@ghostpay/policy-scheme';
import { decodeEventLog, getAddress } from 'viem/utils';
import { UserFacingError } from '../../lib/errors';

/**
 * Watch side of client-side recovery (ADR-0023): a stolen owner key is "delayed, not prevented", so
 * the owner must see every pending withdrawal and destination proposal in time to cancel it with the
 * same key. This reads the account's own events and flags anything this device did not sign.
 */
export type AccountEvent =
  | { readonly kind: 'WithdrawRequested'; readonly id: Hex; readonly token: Address; readonly amount: bigint; readonly executeAfter: bigint; readonly block: bigint }
  | { readonly kind: 'WithdrawExecuted' | 'WithdrawCancelled' | 'DestinationChangeCancelled'; readonly id: Hex; readonly block: bigint }
  | { readonly kind: 'DestinationProposed'; readonly id: Hex; readonly newDestination: Address; readonly effectiveAt: bigint; readonly block: bigint }
  | { readonly kind: 'DestinationChanged'; readonly id: Hex; readonly newDestination: Address; readonly block: bigint };

const MAX_REQUESTS = 50;

export async function fetchAccountEvents(client: RpcClient, chain: ChainConfig, account: Address, fromBlock: bigint, toBlock?: bigint): Promise<{ readonly events: AccountEvent[]; readonly complete: boolean }> {
  if (client.chainId !== chain.chainId) throw new UserFacingError('The RPC is on a different chain.');
  const head = toBlock ?? (await client.blockNumber());
  const step = BigInt(Math.max(1, chain.getLogsMaxRange));
  const events: AccountEvent[] = [];
  let from = fromBlock;
  let requests = 0;
  while (from <= head && requests < MAX_REQUESTS) {
    const to = from + step - 1n > head ? head : from + step - 1n;
    const logs = await client.getLogs({ address: account, topics: [], fromBlock: from, toBlock: to });
    requests++;
    for (const log of logs) {
      if (typeof log.address !== 'string' || log.address.toLowerCase() !== account.toLowerCase() || log.removed === true) continue;
      let d: { eventName: string; args?: Record<string, unknown> };
      try {
        d = decodeEventLog({ abi: policyAccountAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex, strict: true }) as never;
      } catch {
        continue;
      }
      const block = BigInt(log.blockNumber);
      const args = d.args ?? {};
      const rawId = args['id'];
      if (typeof rawId !== 'string') continue;
      const id = rawId.toLowerCase() as Hex;
      switch (d.eventName) {
        case 'WithdrawRequested':
          events.push({ kind: 'WithdrawRequested', id, token: getAddress(args['token'] as string), amount: args['amount'] as bigint, executeAfter: BigInt(args['executeAfter'] as bigint), block });
          break;
        case 'WithdrawExecuted':
        case 'WithdrawCancelled':
        case 'DestinationChangeCancelled':
          events.push({ kind: d.eventName, id, block });
          break;
        case 'DestinationProposed':
          events.push({ kind: 'DestinationProposed', id, newDestination: getAddress(args['newDestination'] as string), effectiveAt: BigInt(args['effectiveAt'] as bigint), block });
          break;
        case 'DestinationChanged':
          events.push({ kind: 'DestinationChanged', id, newDestination: getAddress(args['newDestination'] as string), block });
          break;
        default:
          break;
      }
    }
    from = to + 1n;
  }
  return { events, complete: from > head };
}

export interface PendingWithdrawal {
  readonly id: Hex;
  readonly token: Address;
  readonly amount: bigint;
  readonly executeAfter: bigint;
  /** Signed by this device in this session. */
  readonly known: boolean;
}

export interface AccountAlert {
  readonly level: 'danger' | 'warn';
  readonly text: string;
  /** Request or proposal the owner can cancel. */
  readonly cancel?: { readonly kind: 'withdraw' | 'destination'; readonly id: Hex };
}

export interface AccountSummary {
  readonly pending: readonly PendingWithdrawal[];
  readonly pendingDestination?: { readonly id: Hex; readonly newDestination: Address; readonly effectiveAt: bigint };
  readonly alerts: readonly AccountAlert[];
}

export function summarizeAccount(events: readonly AccountEvent[], knownIds: ReadonlySet<string>, recordDestination: Address): AccountSummary {
  const requested = new Map<string, PendingWithdrawal>();
  const closed = new Set<string>();
  let proposal: AccountSummary['pendingDestination'];
  let changedTo: Address | undefined;
  for (const e of events) {
    if (e.kind === 'WithdrawRequested') requested.set(e.id, { id: e.id, token: e.token, amount: e.amount, executeAfter: e.executeAfter, known: knownIds.has(e.id) });
    else if (e.kind === 'WithdrawExecuted' || e.kind === 'WithdrawCancelled') closed.add(e.id);
    else if (e.kind === 'DestinationProposed') proposal = { id: e.id, newDestination: e.newDestination, effectiveAt: e.effectiveAt };
    else if (e.kind === 'DestinationChangeCancelled') { if (proposal?.id === e.id) proposal = undefined; }
    else if (e.kind === 'DestinationChanged') { if (proposal?.id === e.id) proposal = undefined; changedTo = e.newDestination; }
  }
  const pending = [...requested.values()].filter((r) => !closed.has(r.id));
  const alerts: AccountAlert[] = [];
  for (const p of pending) {
    if (!p.known) {
      alerts.push({ level: 'danger', text: `A withdrawal you did not sign on this device is pending (request ${p.id.slice(0, 10)}…). If it is not yours, your seller keys are compromised: cancel it before it unlocks.`, cancel: { kind: 'withdraw', id: p.id } });
    }
  }
  if (proposal !== undefined) {
    alerts.push({ level: 'danger', text: `A destination change to ${proposal.newDestination} is pending. This app never proposes one; if it is not yours, cancel it now.`, cancel: { kind: 'destination', id: proposal.id } });
  }
  if (changedTo !== undefined && changedTo !== recordDestination && changedTo !== ZERO_ADDRESS) {
    alerts.push({ level: 'warn', text: `The account destination was changed to ${changedTo}. Withdrawals now go there, not to the destination in your policy record.` });
  }
  return { pending, ...(proposal === undefined ? {} : { pendingDestination: proposal }), alerts };
}
