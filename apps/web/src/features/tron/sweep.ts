import type { MessageDescriptor } from '../../lib/errors';
import {
  buildTrxTransfer,
  decodeRawTx,
  decodeTronAddress,
  deriveTronStealthKey,
  encodeSignedTransactionHex,
  estimateBandwidthBytes,
  getNowBlock,
  signTronTx,
  type TronChainParams,
  type TronRpc,
} from '@ghostpay/tron-adapter';
import { zeroize } from '@ghostpay/core-crypto';
import type { FoundPayment } from './scan';
import { getBalanceSun, TronViewError } from './rpc';
import type { TronWallet } from './wallet';

/** Burned by the network when a transfer activates an address that was never used (about 1 TRX). */
export const ACTIVATION_FEE_SUN = 1_000_000n;

export interface SweepReview {
  readonly networkLabel: string;
  readonly from: string;
  readonly destination: string;
  readonly totalSun: bigint;
  /** Upper bound reserved for bandwidth (and activation); what is not burned stays at the one-time address. */
  readonly feeReserveSun: bigint;
  readonly sendSun: bigint;
  readonly warnings: readonly MessageDescriptor[];
}

export interface SignedSweep {
  readonly txID: string;
  readonly signedHex: string;
}

export function formatTrx(sun: bigint): string {
  const whole = sun / 1_000_000n;
  const frac = (sun % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${String(whole)}${frac === '' ? '' : `.${frac}`} TRX`;
}

export interface ReviewContext {
  readonly params: TronChainParams;
  readonly destinationActivated: boolean;
}

/** Reference block placeholder: it only has to give the transaction a realistic size. */
const SIZE_PROBE = { number: 1n, blockId: '00'.repeat(32) } as const;
const SIZE_PROBE_TIME = 1_700_000_000_000n;

/** Validates the destination and computes the exact amounts. @throws {TronViewError} with a user-safe message. */
export function reviewSweep(wallet: TronWallet, found: FoundPayment, destination: string, ctx: ReviewContext): SweepReview {
  const dest = destination.trim();
  decodeTronAddress(dest);
  if (dest === found.stealthAddress) {
    throw new TronViewError({ key: 'chainView.error.sameAddress' });
  }
  const probe = buildTrxTransfer({
    owner: found.stealthAddress,
    to: dest,
    amountSun: found.balanceSun,
    refBlock: SIZE_PROBE,
    timestampMs: SIZE_PROBE_TIME,
  });
  const bandwidthSun = estimateBandwidthBytes(probe.rawData.length) * ctx.params.bandwidthFeeSun;
  const activationSun = ctx.destinationActivated ? 0n : ACTIVATION_FEE_SUN;
  const feeReserveSun = bandwidthSun + activationSun;
  const sendSun = found.balanceSun - feeReserveSun;
  if (sendSun <= 0n) throw new TronViewError({ key: 'tron.error.balanceFee' });
  const warnings: MessageDescriptor[] = [
    { key: 'chainView.sweep.links' },
    { key: 'tron.sweep.feeReserve' },
  ];
  if (!ctx.destinationActivated) {
    warnings.push({ key: 'tron.sweep.activation' });
  }
  return {
    networkLabel: wallet.net.label,
    from: found.stealthAddress,
    destination: dest,
    totalSun: found.balanceSun,
    feeReserveSun,
    sendSun,
    warnings,
  };
}

export interface SignParams {
  readonly rpc: TronRpc;
  readonly wallet: TronWallet;
  readonly found: FoundPayment;
  readonly review: SweepReview;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
}

/** Re-checks the balance, builds the transfer, and signs it with the derived one-time key. Never sends. */
export async function signSweep(p: SignParams): Promise<SignedSweep> {
  const { rpc, wallet, found, review, signal } = p;
  const balance = await getBalanceSun(rpc, found.stealthAddress, signal);
  if (balance !== review.totalSun) {
    throw new TronViewError({ key: 'tron.error.balanceChanged' });
  }
  const head = await getNowBlock(rpc, signal);
  const tx = buildTrxTransfer({
    owner: found.stealthAddress,
    to: review.destination,
    amountSun: review.sendSun,
    refBlock: { number: head.number, blockId: head.blockId },
    timestampMs: BigInt(p.nowMs),
  });
  // The bytes about to be signed must say exactly what the review said.
  const decoded = decodeRawTx(tx.rawData);
  if (decoded.kind !== 'trx' || decoded.owner !== found.stealthAddress || decoded.to !== review.destination || decoded.amount !== review.sendSun) {
    throw new TronViewError({ key: 'tron.error.reviewMismatch' });
  }
  if (signal?.aborted === true) throw new TronViewError({ key: 'tron.error.aborted' });
  const key = deriveTronStealthKey(
    { stealthAddress: found.stealthAddress, memo: found.memo },
    { viewingSecret: wallet.keys.viewingSecret, spendingSecret: wallet.keys.spendingSecret },
  );
  try {
    return { txID: tx.txID, signedHex: encodeSignedTransactionHex(tx, signTronTx(tx, key)) };
  } finally {
    zeroize(key);
  }
}

// i18n-use: chainView.error.sameAddress tron.error.balanceFee chainView.sweep.links tron.sweep.feeReserve tron.sweep.activation tron.error.balanceChanged tron.error.reviewMismatch

// i18n-use: tron.error.aborted
