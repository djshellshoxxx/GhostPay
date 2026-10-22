import { encodeAbiParameters, isHex, keccak256, size, zeroAddress, type Address, type Hex } from 'viem';
import { DonationError } from './errors.js';
import { isUsableRecipient } from './recipient.js';

/** Lifecycle of one donation. It is independent from the payment's own status. */
export type DonationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/** One donation attempt. */
export interface DonationAttempt {
  paymentTxHash: Hex;
  /** Idempotency key from {@link donationKey}. */
  key: Hex;
  status: DonationStatus;
  donationTxHash?: Hex;
}

/** Events accepted by {@link reduceAttempt}. */
export type DonationEvent =
  { type: 'sent'; txHash: Hex } | { type: 'failed' } | { type: 'skipped' } | { type: 'retry' };

function assertHash32(h: unknown): asserts h is Hex {
  if (typeof h !== 'string' || !isHex(h, { strict: true }) || size(h) !== 32) {
    throw new DonationError('INVALID_HASH', 'expected a 32-byte hex hash');
  }
}

/**
 * Deterministic idempotency key: keccak256(abi.encode("ghostpay.donation.v1", paymentTxHash, recipient, token, amount)).
 * Native uses the zero address as token marker (a real token can never be zero: it is rejected elsewhere).
 * @security Pure; the same inputs give the same key so a retry never sends twice.
 * @param paymentTxHash Confirmed payment transaction hash.
 * @param recipient Donation recipient.
 * @param token Token address or `'native'`.
 * @param amount Donation amount in base units.
 */
export function donationKey(
  paymentTxHash: Hex,
  recipient: Address,
  token: Address | 'native',
  amount: bigint,
): Hex {
  assertHash32(paymentTxHash);
  if (!isUsableRecipient(recipient) || (token !== 'native' && !isUsableRecipient(token))) {
    throw new DonationError('INVALID_ADDRESS', 'recipient and token must be valid addresses');
  }
  if (typeof amount !== 'bigint' || amount <= 0n || amount >= 1n << 256n) {
    throw new DonationError('INVALID_AMOUNT', 'amount must be a positive uint256');
  }
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'string' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      ['ghostpay.donation.v1', paymentTxHash, recipient, token === 'native' ? zeroAddress : token, amount],
    ),
  );
}

/**
 * Starts an attempt, or returns the existing one for the same key (idempotent).
 * @security Pure; never touches the payment's status.
 * @param existing Stored attempt for this key, if any.
 * @param paymentTxHash Payment hash.
 * @param key Idempotency key.
 */
export function beginAttempt(
  existing: DonationAttempt | undefined,
  paymentTxHash: Hex,
  key: Hex,
): DonationAttempt {
  if (existing !== undefined) return existing;
  assertHash32(paymentTxHash);
  assertHash32(key);
  return { paymentTxHash, key, status: 'pending' };
}

/**
 * True only for a pending attempt: sent and skipped are terminal; failed needs an explicit retry.
 * @security Guards double sends.
 * @param a Attempt.
 */
export function canSendDonation(a: DonationAttempt): boolean {
  return a.status === 'pending';
}

/**
 * Pure transition function. Illegal transitions throw `INVALID_STATE`.
 * pending -> sent|failed|skipped; failed -> pending (retry) or sent (late discovery); sent/skipped terminal.
 * @security A donation outcome never alters the payment: there is no payment state here to change.
 * @param a Current attempt.
 * @param e Event.
 */
export function reduceAttempt(a: DonationAttempt, e: DonationEvent): DonationAttempt {
  const illegal = (): never => {
    throw new DonationError('INVALID_STATE', 'illegal donation state transition');
  };
  switch (e.type) {
    case 'sent':
      if (a.status !== 'pending' && a.status !== 'failed') return illegal();
      assertHash32(e.txHash);
      return { ...a, status: 'sent', donationTxHash: e.txHash };
    case 'failed':
      if (a.status !== 'pending') return illegal();
      return { ...a, status: 'failed' };
    case 'skipped':
      if (a.status !== 'pending') return illegal();
      return { ...a, status: 'skipped' };
    case 'retry':
      if (a.status !== 'failed') return illegal();
      return { ...a, status: 'pending' };
  }
}
