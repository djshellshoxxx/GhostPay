import { grossForNet, routerNet } from '@ghostpay/chain-adapters';
import { invoiceDigest, type Invoice } from '@ghostpay/invoice-schema';
import { bytesToHex } from '@noble/hashes/utils.js';
import { UserFacingError } from './errors';
import type { ReconciliationRecord } from './reconciliationLedger';

/**
 * Local invoice-to-payment matching (audit gap G-04). Nothing here is published: the chain carries no invoice
 * reference, so matches are inferred on this device from chain, asset, exact router net amount and a time window.
 * A proposal is a hint for the seller, never payment evidence; seller-signed receipts are never an input.
 */
export const MAX_REGISTERED_INVOICES = 500;
/** Tolerated device clock difference between invoice creation and the scan that recorded a payment. */
export const MATCH_CLOCK_SKEW_MS = 5 * 60_000;
/**
 * Scans record observation time, not block time. A payment first observed this long after the invoice expired
 * may have been paid late, so it is never proposed as an exact match.
 */
export const MATCH_LATE_GRACE_MS = 7 * 24 * 3600_000;

export interface RegisteredInvoice {
  readonly version: 1;
  readonly invoiceDigest: string;
  /** Local identity only; the nonce never appears on chain. */
  readonly nonce: string;
  readonly chainId: number;
  readonly asset: string;
  /** Exact router net amount a GhostPay payment of this invoice delivers to the one-time address. */
  readonly expectedNetMinorUnits: string;
  /** Unix seconds (invoice quote timestamp). */
  readonly createdAt: number;
  /** Unix seconds. */
  readonly expiresAt: number;
  /** Milliseconds since the epoch. */
  readonly registeredAt: number;
}

export type MatchProposal =
  | { readonly kind: 'exact'; readonly invoice: RegisteredInvoice }
  | {
      readonly kind: 'ambiguous';
      readonly candidates: readonly RegisteredInvoice[];
      readonly reason: 'multiple-invoices' | 'multiple-payments' | 'late-observation';
    }
  | { readonly kind: 'none' };

type ContextRecord = ReconciliationRecord & { readonly provenance?: 'live-scan' | 'imported-history' };

const KEYS = 'asset|chainId|createdAt|expectedNetMinorUnits|expiresAt|invoiceDigest|nonce|registeredAt|version';
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_TIME_MS = 8_640_000_000_000_000;

function fail(message: string): never {
  throw new Error(message);
}

export function validateRegisteredInvoice(value: unknown): RegisteredInvoice {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    return fail('Invalid registered invoice.');
  const o = value as Record<string, unknown>;
  if (Object.keys(o).sort().join('|') !== KEYS || o.version !== 1) return fail('Invalid registered invoice.');
  if (typeof o.invoiceDigest !== 'string' || !/^0x[0-9a-f]{64}$/.test(o.invoiceDigest)) return fail('Invalid registered invoice digest.');
  if (typeof o.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(o.nonce)) return fail('Invalid registered invoice nonce.');
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) return fail('Invalid registered invoice chain.');
  if (typeof o.asset !== 'string' || (o.asset !== 'native' && !/^0x[0-9a-f]{40}$/.test(o.asset))) return fail('Invalid registered invoice asset.');
  if (typeof o.expectedNetMinorUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(o.expectedNetMinorUnits) || BigInt(o.expectedNetMinorUnits) > MAX_UINT256)
    return fail('Invalid registered invoice amount.');
  const seconds = (n: unknown): boolean => Number.isSafeInteger(n) && (n as number) > 0 && (n as number) * 1000 <= MAX_TIME_MS;
  if (!seconds(o.createdAt) || !seconds(o.expiresAt) || (o.expiresAt as number) <= (o.createdAt as number))
    return fail('Invalid registered invoice time window.');
  if (!Number.isSafeInteger(o.registeredAt) || (o.registeredAt as number) <= 0 || (o.registeredAt as number) > MAX_TIME_MS)
    return fail('Invalid registered invoice timestamp.');
  return o as unknown as RegisteredInvoice;
}

/** Keeps only the fields matching needs: no line items, memo, fiat totals, meta-address or signer key. */
export function registrationFromInvoice(invoice: Invoice, registeredAt = Date.now()): RegisteredInvoice {
  if (invoice.amountPolicy.mode !== 'fixed_token')
    throw new UserFacingError('Only invoices with a fixed token amount can be registered for automatic matching.');
  const wanted = BigInt(invoice.amountPolicy.tokenAmount);
  const net = invoice.feePolicy === 'payer_pays' ? routerNet(grossForNet(wanted)) : routerNet(wanted);
  return validateRegisteredInvoice({
    version: 1,
    invoiceDigest: `0x${bytesToHex(invoiceDigest(invoice))}`,
    nonce: invoice.nonce,
    chainId: invoice.chainId,
    asset: invoice.token,
    expectedNetMinorUnits: net.toString(),
    createdAt: invoice.quote.timestamp,
    expiresAt: invoice.expiresAt,
    registeredAt,
  });
}

/** Only current router-verified live observations without an annotation take part in automatic matching. */
function eligible(record: ContextRecord): boolean {
  return (
    record.evidenceStatus === 'verified-at-scan' &&
    record.evidenceSource === 'verified-router-scan' &&
    record.invoiceDigest === undefined &&
    (record.provenance === undefined || record.provenance === 'live-scan')
  );
}

function candidate(invoice: RegisteredInvoice, record: ContextRecord): boolean {
  return (
    invoice.chainId === record.chainId &&
    invoice.asset === record.asset &&
    invoice.expectedNetMinorUnits === record.amountMinorUnits &&
    record.recordedAt >= invoice.createdAt * 1000 - MATCH_CLOCK_SKEW_MS
  );
}

/**
 * Proposes a registered invoice for one observation. `exact` needs a unique pairing in both directions within the
 * supplied context and an observation not long after expiry; every other overlap is `ambiguous` and must be resolved
 * by the seller. Invoices already linked to a current verified observation are not offered again.
 */
export function proposeInvoiceMatch(
  record: ContextRecord,
  invoices: readonly RegisteredInvoice[],
  context: readonly ContextRecord[],
): MatchProposal {
  if (!eligible(record)) return { kind: 'none' };
  const byId = new Map<string, ContextRecord>();
  for (const item of [...context, record]) byId.set(item.id, item);
  const all = [...byId.values()];
  const claimed = new Set(
    all.filter((r) => r.evidenceStatus === 'verified-at-scan' && r.invoiceDigest !== undefined).map((r) => r.invoiceDigest),
  );
  const open = invoices.filter((invoice) => !claimed.has(invoice.invoiceDigest));
  const candidates = open.filter((invoice) => candidate(invoice, record));
  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates, reason: 'multiple-invoices' };
  const invoice = candidates[0]!;
  const competing = all.filter((r) => r.id !== record.id && eligible(r) && candidate(invoice, r));
  if (competing.length > 0) return { kind: 'ambiguous', candidates, reason: 'multiple-payments' };
  if (record.recordedAt > invoice.expiresAt * 1000 + MATCH_LATE_GRACE_MS)
    return { kind: 'ambiguous', candidates, reason: 'late-observation' };
  return { kind: 'exact', invoice };
}
