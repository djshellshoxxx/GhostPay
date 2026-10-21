import { requireConfig } from './errors.js';
import type { Finding, Probe } from './types.js';
import { mk } from './util.js';

/** Plain numeric snapshot of the relayer hot key (supplied by the operator's own accounting). */
export interface W4Inputs {
  readonly chainId: number;
  /** Configured hot key address. */
  readonly address: string;
  readonly balanceWei: bigint;
  readonly balanceFloorWei: bigint;
  /** `eth_getTransactionCount(address, 'latest')`. */
  readonly latestNonce: number;
  /** `eth_getTransactionCount(address, 'pending')`. */
  readonly pendingNonce: number;
  /** Largest tolerated pending-minus-latest gap. */
  readonly maxNonceGap: number;
  /** Gas paid without reimbursement today (`LossBudget` total). */
  readonly unreimbursedGasWeiToday: bigint;
  readonly dailyUnreimbursedCapWei: bigint;
}

const isNonce = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/**
 * W4 relayer hot key: balance vs floor, nonce gap (stuck tx, S3-18f) and unreimbursed gas per day.
 *
 * @remarks Thresholds: balance below the floor is `page`, below twice the floor `warn`; gap above
 * `maxNonceGap` is `warn`, above twice it `page`; losses at 80 percent of the cap `warn`, at the cap `page`.
 * @security Holds no key and signs nothing. Invalid inputs throw `INVALID_CONFIG` (the runner reports a `warn`).
 * @param source Supplies the current snapshot.
 */
export function createW4Probe(source: () => W4Inputs | Promise<W4Inputs>): Probe {
  return {
    id: 'W4',
    async run() {
      const i = await source();
      requireConfig(isNonce(i.latestNonce) && isNonce(i.pendingNonce) && i.pendingNonce >= i.latestNonce, 'nonces');
      requireConfig(isNonce(i.maxNonceGap), 'maxNonceGap');
      requireConfig(i.balanceWei >= 0n && i.balanceFloorWei >= 0n, 'balance');
      requireConfig(i.unreimbursedGasWeiToday >= 0n && i.dailyUnreimbursedCapWei > 0n, 'loss budget');
      const out: Finding[] = [];
      const add = (sev: 'warn' | 'page', d: string): void => {
        out.push(mk('W4', sev, i.address, d, i.chainId));
      };
      if (i.balanceWei < i.balanceFloorWei) add('page', `balance ${i.balanceWei.toString()} wei below floor ${i.balanceFloorWei.toString()}`);
      else if (i.balanceWei < i.balanceFloorWei * 2n) add('warn', `balance ${i.balanceWei.toString()} wei within 2x of floor ${i.balanceFloorWei.toString()}`);
      const gap = i.pendingNonce - i.latestNonce;
      if (gap > i.maxNonceGap * 2) add('page', `nonce gap ${String(gap)} (stuck transaction)`);
      else if (gap > i.maxNonceGap) add('warn', `nonce gap ${String(gap)} above ${String(i.maxNonceGap)}`);
      const loss = i.unreimbursedGasWeiToday;
      if (loss >= i.dailyUnreimbursedCapWei) add('page', `unreimbursed gas ${loss.toString()} wei reached daily cap`);
      else if (loss * 5n >= i.dailyUnreimbursedCapWei * 4n) add('warn', `unreimbursed gas ${loss.toString()} wei at 80% of daily cap`);
      return out.length > 0 ? out : [mk('W4', 'info', i.address, 'hot key balance, nonce gap and losses within limits', i.chainId)];
    },
  };
}
