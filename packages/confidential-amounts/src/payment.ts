import { decodeEventLog, getAddress, isAddress, type Address, type Hex } from 'viem';
import { ROUTER_ABI, TOKEN_ABI } from './abi.js';

/** Seller-side verdict on a confidential payment after (or before) decryption (CT-PAY-6). */
export type PaymentStatus = 'unconfirmed' | 'confirmed' | 'underpaid' | 'failed_insufficient_balance';

/**
 * Classifies a confidential payment.
 * @param expectedNet Invoice net amount in base units.
 * @param decrypted Decrypted amount, or `undefined` while the seller has not decrypted yet.
 * @returns `unconfirmed` until decrypted; `failed_insufficient_balance` for a decrypted 0 (silent zero
 * transfer); `confirmed` for `>= expectedNet`; `underpaid` otherwise.
 * @security Never mark a payment paid from the announcement alone: the handle may decrypt to 0, and a handle that
 * decrypts to any value may not belong to a real payment. Classify only handles that passed
 * {@link verifyPaymentProvenance}.
 */
export function classifyPayment(expectedNet: bigint, decrypted: bigint | undefined): PaymentStatus {
  if (decrypted === undefined) return 'unconfirmed';
  if (decrypted === 0n) return 'failed_insufficient_balance';
  return decrypted >= expectedNet ? 'confirmed' : 'underpaid';
}

/** Warning keys for a public wrap amount (CT-UX-2, CT-UX-4). */
export type WrapWarning = 'CT_WRAP_PUBLIC' | 'CT_WRAP_EQUALS_GROSS' | 'CT_WRAP_NOT_ROUND';

/**
 * Warnings to show before a wrap, whose amount is public on-chain.
 * @param wrapAmount Amount to wrap (base units).
 * @param invoiceGross Gross amount of the invoice about to be paid, if known.
 * @param roundUnit Denomination considered "round" (default 10^6 = 1 whole 6-decimal token).
 */
export function wrapWarnings(wrapAmount: bigint, invoiceGross?: bigint, roundUnit = 1_000_000n): WrapWarning[] {
  const out: WrapWarning[] = ['CT_WRAP_PUBLIC'];
  if (invoiceGross !== undefined && wrapAmount === invoiceGross) out.push('CT_WRAP_EQUALS_GROSS');
  if (roundUnit > 0n && wrapAmount % roundUnit !== 0n) out.push('CT_WRAP_NOT_ROUND');
  return out;
}

/** A raw receipt log (`eth_getTransactionReceipt` shape, address + topics + data). */
export interface PaymentLog {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/** Pinned identities a confidential payment must come from. */
export interface PinnedPayment {
  /** Pinned `GhostPayConfidentialRouter`. */
  readonly router: string;
  /** Pinned confidential (ERC-7984) token. */
  readonly token: string;
  /** Seller's one-time stealth address. */
  readonly stealth: string;
  /** Net-amount handle named by the announcement. */
  readonly handle: Hex;
}

/** Outcome of {@link verifyPaymentProvenance}. */
export type ProvenanceResult = 'verified' | 'missing-router-event' | 'missing-token-transfer' | 'invalid-input';

/** Most logs one receipt may present (bounds work on hostile input). */
export const MAX_RECEIPT_LOGS = 1024;
const HANDLE_RE = /^0x[0-9a-fA-F]{64}$/;

function sameAddress(a: unknown, b: Address): boolean {
  return typeof a === 'string' && isAddress(a, { strict: false }) && getAddress(a) === b;
}

/**
 * Checks that a receipt really carries a GhostPay confidential payment of `handle` to `stealth`: the pinned router's
 * `ConfidentialPayment(token, handle)` AND the pinned token's `ConfidentialTransfer(router, stealth, handle)`.
 * Decrypting an announced handle proves nothing by itself: anyone who owns a ciphertext can `FHE.allow` it to the
 * stealth address and the token, and anyone can call the ERC-5564 announcer. Only handles that pass this check may be
 * decrypted and classified with {@link classifyPayment}.
 * @security Never throws on hostile logs; malformed entries are ignored.
 */
export function verifyPaymentProvenance(logs: readonly PaymentLog[], pinned: PinnedPayment): ProvenanceResult {
  if (!Array.isArray(logs) || logs.length > MAX_RECEIPT_LOGS) return 'invalid-input';
  if (typeof pinned.handle !== 'string' || !HANDLE_RE.test(pinned.handle) || /^0x0{64}$/.test(pinned.handle)) return 'invalid-input';
  const ids = [pinned.router, pinned.token, pinned.stealth];
  if (!ids.every((a) => typeof a === 'string' && isAddress(a, { strict: false }))) return 'invalid-input';
  const router = getAddress(pinned.router);
  const token = getAddress(pinned.token);
  const stealth = getAddress(pinned.stealth);
  const handle = pinned.handle.toLowerCase();
  let routerEvent = false;
  let tokenTransfer = false;
  for (const log of logs as readonly unknown[]) {
    if (typeof log !== 'object' || log === null) continue;
    const { address, topics, data } = log as Partial<PaymentLog>;
    if (!Array.isArray(topics) || typeof data !== 'string') continue;
    try {
      if (sameAddress(address, router)) {
        const ev = decodeEventLog({ abi: ROUTER_ABI, topics: topics as [Hex, ...Hex[]], data, strict: true });
        if (ev.eventName === 'ConfidentialPayment' && getAddress(ev.args.token) === token && ev.args.netHandle.toLowerCase() === handle) {
          routerEvent = true;
        }
      } else if (sameAddress(address, token)) {
        const ev = decodeEventLog({ abi: TOKEN_ABI, topics: topics as [Hex, ...Hex[]], data, strict: true });
        if (
          ev.eventName === 'ConfidentialTransfer' &&
          getAddress(ev.args.from) === router &&
          getAddress(ev.args.to) === stealth &&
          ev.args.amount.toLowerCase() === handle
        ) {
          tokenTransfer = true;
        }
      }
    } catch {
      // unrelated or malformed log: ignore
    }
  }
  if (!routerEvent) return 'missing-router-event';
  if (!tokenTransfer) return 'missing-token-transfer';
  return 'verified';
}
