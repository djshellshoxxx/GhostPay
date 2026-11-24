import type { MessageDescriptor } from '../../lib/errors';
import { base58 } from '@scure/base';
import {
  buildStealthSweepTx,
  deriveSpendKey,
  getLatestBlockhash,
  parseSolanaAddress,
  signWithStealthKey,
  toWireBase64,
  zeroize,
  type SolanaRpc,
} from '@ghostpay/solana-stealth';
import type { FoundPayment } from './scan';
import { getBalance, SolViewError } from './rpc';
import type { SolWallet } from './wallet';

/** Base fee for a one-signature transaction (the one-time address pays its own fee). */
export const SWEEP_FEE_LAMPORTS = 5000n;
/** Rent-exempt minimum of an empty system account; a transfer below it to a new account fails. */
export const NEW_ACCOUNT_MIN_LAMPORTS = 890_880n;

export interface SweepReview {
  readonly networkLabel: string;
  readonly from: string;
  readonly destination: string;
  readonly totalLamports: bigint;
  readonly feeLamports: bigint;
  readonly sendLamports: bigint;
  readonly warnings: readonly MessageDescriptor[];
}

export interface SignedSweep {
  readonly signature: string;
  readonly wireBase64: string;
}

export function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${String(whole)}${frac === '' ? '' : `.${frac}`} SOL`;
}

/** Validates the destination and computes the exact amounts. @throws {SolViewError} with a user-safe message. */
export function reviewSweep(wallet: SolWallet, found: FoundPayment, destination: string): SweepReview {
  const dest = parseSolanaAddress(destination.trim());
  if (dest === found.stealthAddress) {
    throw new SolViewError({ key: 'chainView.error.sameAddress' });
  }
  const send = found.balanceLamports - SWEEP_FEE_LAMPORTS;
  if (send <= 0n) throw new SolViewError({ key: 'sol.error.balanceFee' });
  const warnings: MessageDescriptor[] = [
    { key: 'chainView.sweep.links' },
  ];
  if (send < NEW_ACCOUNT_MIN_LAMPORTS) {
    warnings.push({ key: 'sol.sweep.minimum', values: { amount: formatSol(NEW_ACCOUNT_MIN_LAMPORTS) } });
  }
  if (found.tokenReceiptCount > 0) {
    warnings.push({ key: 'sol.sweep.tokensStay' });
  }
  return {
    networkLabel: wallet.net.label,
    from: found.stealthAddress,
    destination: dest,
    totalLamports: found.balanceLamports,
    feeLamports: SWEEP_FEE_LAMPORTS,
    sendLamports: send,
    warnings,
  };
}

export interface SignParams {
  readonly rpc: SolanaRpc;
  readonly wallet: SolWallet;
  readonly found: FoundPayment;
  readonly review: SweepReview;
  readonly signal?: AbortSignal;
}

/** Re-checks the balance, builds the transfer, and signs it with the derived one-time key. Never sends. */
export async function signSweep(p: SignParams): Promise<SignedSweep> {
  const { rpc, wallet, found, review, signal } = p;
  const balance = await getBalance(rpc, found.stealthAddress, signal);
  if (balance !== review.totalLamports) {
    throw new SolViewError({ key: 'sol.error.balanceChanged' });
  }
  const lifetime = await getLatestBlockhash(rpc, 'finalized', signal);
  const tx = await buildStealthSweepTx({
    stealthAddress: found.stealthAddress,
    destination: review.destination,
    asset: { kind: 'native' },
    amount: review.sendLamports,
    lifetime,
  });
  if (signal?.aborted === true) throw new SolViewError({ key: 'sol.error.aborted' });
  const spendKey = deriveSpendKey(wallet.keys.spendSecret, found.tweak, base58.decode(found.stealthAddress));
  try {
    const signed = signWithStealthKey(tx, spendKey);
    const sig = signed.transaction.signatures[parseSolanaAddress(found.stealthAddress)];
    if (sig == null) throw new SolViewError({ key: 'sol.error.signing' });
    return { signature: base58.encode(sig), wireBase64: toWireBase64(signed) };
  } finally {
    zeroize(spendKey);
  }
}

// i18n-use: chainView.error.sameAddress sol.error.balanceFee chainView.sweep.links sol.sweep.minimum sol.sweep.tokensStay sol.error.balanceChanged sol.error.signing

// i18n-use: sol.error.aborted
