import type { Hex } from '@ghostpay/chain-adapters';
import type { MessageKey } from '../i18n/catalog';
import { UserFacingError, displayMessage, type MessageDescriptor } from './errors';

/** Presentation states only: callers must supply observed evidence, never infer finality from a signature or hash. */
export type TransactionPhase = 'prepared' | 'awaiting-authorization' | 'signed' | 'broadcast-attempted'
  | 'broadcast-unknown' | 'pending-confirmation' | 'confirmed' | 'failed' | 'replaced' | 'reorganized'
  | 'unsupported' | 'verification-incomplete';

export interface TransactionOutcome {
  readonly phase: TransactionPhase;
  readonly message: MessageDescriptor;
  /** Exact references and diagnostic codes are data, never translated or reconstructed from prose. */
  readonly hash?: Hex;
  readonly approvalHash?: Hex;
  readonly code?: string | number;
}

export const TRANSACTION_PHASE_KEYS: Readonly<Record<TransactionPhase, MessageKey>> = {
  prepared: 'transaction.phase.prepared',
  'awaiting-authorization': 'transaction.phase.authorization',
  signed: 'transaction.phase.signed',
  'broadcast-attempted': 'transaction.phase.broadcastAttempted',
  'broadcast-unknown': 'transaction.phase.broadcastUnknown',
  'pending-confirmation': 'transaction.phase.pending',
  confirmed: 'transaction.phase.confirmed',
  failed: 'transaction.phase.failed',
  replaced: 'transaction.phase.replaced',
  reorganized: 'transaction.phase.reorganized',
  unsupported: 'transaction.phase.unsupported',
  'verification-incomplete': 'transaction.phase.incomplete',
};

export class TransactionOutcomeError extends UserFacingError {
  public constructor(public readonly outcome: TransactionOutcome) {
    super(outcome.message);
    this.name = 'TransactionOutcomeError';
  }
}

/** The first argument retains the legacy source-string API; UI consumers retain the structured second argument. */
export type TransactionStatusFn = (message: string, outcome?: TransactionOutcome) => void;

export function reportTransactionStatus(status: TransactionStatusFn, outcome: TransactionOutcome): void {
  status(displayMessage(outcome.message), outcome);
}

/** Specific context-safe details, never English sentence stripping or arbitrary exception text. */
function afterApprovalDetail(error: unknown, requested: boolean): MessageDescriptor {
  if (error instanceof TransactionOutcomeError) return error.outcome.message;
  if (error instanceof UserFacingError) {
    switch (error.translation?.key) {
      case 'error.pay.thisInvoiceHasExpiredNothingWasSent': return { key: 'transaction.detail.invoiceExpired' };
      case 'error.pay.theSellerSPriceQuoteHasExpiredNothingWasSent': return { key: 'transaction.detail.quoteExpired' };
      case 'error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent': return { key: 'transaction.detail.bufferExpired' };
      default: break;
    }
  }
  return { key: requested ? 'transaction.detail.reviewWallet' : 'transaction.detail.reviewAgain' };
}

/** An approval is already on chain. A later payment handoff must never become a claim that nothing was sent. */
export function approvedPaymentOutcome(error: unknown, requested: boolean, approvalHash?: Hex): TransactionOutcome {
  const outcome = error instanceof TransactionOutcomeError ? error.outcome : undefined;
  return {
    phase: requested ? 'broadcast-unknown' : 'prepared',
    ...(approvalHash === undefined ? {} : { approvalHash }),
    ...(outcome?.code === undefined ? {} : { code: outcome.code }),
    message: {
      key: requested ? 'transaction.approved.paymentUnknown' : 'transaction.approved.paymentNotSent',
      values: {
        reference: approvalHash === undefined ? '' : ` (${approvalHash})`,
        detail: afterApprovalDetail(error, requested),
      },
    },
  };
}

// i18n-use: error.pay.theGasBufferQuoteExpiredBeforeSendingNothingWasSent error.pay.theSellerSPriceQuoteHasExpiredNothingWasSent error.pay.thisInvoiceHasExpiredNothingWasSent transaction.approved.paymentNotSent transaction.approved.paymentUnknown transaction.detail.bufferExpired transaction.detail.invoiceExpired transaction.detail.quoteExpired transaction.detail.reviewAgain transaction.detail.reviewWallet transaction.phase.authorization transaction.phase.broadcastAttempted transaction.phase.broadcastUnknown transaction.phase.confirmed transaction.phase.failed transaction.phase.incomplete transaction.phase.pending transaction.phase.prepared transaction.phase.reorganized transaction.phase.replaced transaction.phase.signed transaction.phase.unsupported
