import {
  createReconciliationApi,
  type ReconciliationRecord,
  type ReconciliationScope,
  type RegisteredInvoice,
  type VaultRecord,
} from './reconciliation-portable.js';

export type InvoicePaymentSummary =
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'unlinked' | 'below' | 'equal' | 'above';
      readonly observedMinorUnits: string;
      readonly expectedMinorUnits: string;
      readonly observationCount: number;
    };

const { validateRegisteredInvoice, validateReconciliationRecord, MAX_RECONCILIATION_RECORDS } = createReconciliationApi();

/**
 * Compare explicitly seller-linked observations with the invoice's expected router net amount.
 * This never infers a link, reads a receipt, changes matching, or proves invoice attribution/settlement.
 * Live records entered through recordFromVerifiedMatch were final at scan time; pending/claimed,
 * imported and reorg-invalidated observations cannot contribute. No new finality check happens here.
 */
export function summarizeInvoicePayments(
  invoice: RegisteredInvoice,
  records: readonly VaultRecord[],
  scope: ReconciliationScope,
): InvoicePaymentSummary {
  return createInvoicePaymentSummarizer(records, scope)(invoice);
}

/** Validate/index a scope once, so rendering many registrations does not repeatedly scan the whole vault. */
export function createInvoicePaymentSummarizer(
  records: readonly VaultRecord[],
  scope: ReconciliationScope,
): (invoice: RegisteredInvoice) => InvoicePaymentSummary {
  const unavailable = (): InvoicePaymentSummary => ({ kind: 'unavailable' });
  const linked = new Map<string, ReconciliationRecord[]>();
  let chainId: number;
  try {
    if (
      !/^[0-9a-f]{64}$/.test(scope.sellerKeyId) || !Number.isSafeInteger(scope.chainId) || scope.chainId <= 0 ||
      records.length > MAX_RECONCILIATION_RECORDS
    ) return unavailable;
    chainId = scope.chainId;
    const seen = new Map<string, string>();
    for (const value of records) {
      if (
        value.sellerKeyId !== scope.sellerKeyId || value.chainId !== chainId ||
        value.provenance !== 'live-scan' || value.evidenceStatus !== 'verified-at-scan'
      ) continue;
      const { provenance, ...plain } = value;
      void provenance;
      const record = validateReconciliationRecord(plain);
      // The verified direct router transaction carries one payment across inclusion positions.
      const event = record.transactionHash;
      // Check the whole scope before filtering invoice/asset: conflicting copies cannot reserve different invoices.
      const facts = `${record.id}:${record.blockNumber}:${record.blockTimestamp ?? ''}:${record.asset}:${record.amountMinorUnits}:${record.invoiceDigest ?? ''}:${record.lateAcceptedAt ?? ''}`;
      const previous = seen.get(event);
      if (previous !== undefined) {
        if (previous !== facts) return unavailable;
        continue;
      }
      seen.set(event, facts);
      if (record.invoiceDigest !== undefined) {
        const key = `${record.invoiceDigest}:${record.asset}`;
        const group = linked.get(key) ?? [];
        group.push(record);
        linked.set(key, group);
      }
    }
  } catch {
    // Corrupt or conflicting local input must never produce a reassuring amount comparison.
    return unavailable;
  }
  return (invoice): InvoicePaymentSummary => {
    try {
      const registered = validateRegisteredInvoice(invoice);
      if (registered.chainId !== chainId) return unavailable();
      const records = linked.get(`${registered.invoiceDigest}:${registered.asset}`) ?? [];
      const confirmed = records.filter((record) => record.blockTimestamp === undefined ||
        BigInt(record.blockTimestamp) < BigInt(registered.expiresAt) ||
        (record.lateAcceptedAt !== undefined && record.amountMinorUnits === registered.expectedNetMinorUnits));
      const count = confirmed.length;
      const amount = confirmed.reduce((sum, record) => sum + BigInt(record.amountMinorUnits), 0n);
      const expected = BigInt(registered.expectedNetMinorUnits);
      return {
        kind: count === 0 ? 'unlinked' : amount < expected ? 'below' : amount > expected ? 'above' : 'equal',
        observedMinorUnits: amount.toString(), expectedMinorUnits: registered.expectedNetMinorUnits, observationCount: count,
      };
    } catch {
      return unavailable();
    }
  };
}
