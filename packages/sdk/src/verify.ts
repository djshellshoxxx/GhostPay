import { wrapInvoice } from './errors.js';
import {
  checkExpiry,
  parseFragment,
  InvoiceError,
  type Invoice,
  type ParsedInvoice,
  type TrustLevel,
} from '@ghostpay/invoice-schema';

/** First chain id reserved for GhostPay test mode (mirrors `@ghostpay/sandbox`). */
export const TEST_CHAIN_ID_MIN = 31337;
/** Last chain id reserved for GhostPay test mode, inclusive. */
export const TEST_CHAIN_ID_MAX = 31399;
/** Memo prefix carried by branded test invoices (mirrors `@ghostpay/sandbox`). */
export const TEST_MEMO_PREFIX = '[TEST - NO REAL FUNDS] ';
/** Invoices with less time left than this get an `expires-soon` warning. */
export const EXPIRES_SOON_SECONDS = 300;

export type WarningCode =
  | 'invalid-signature'
  | 'invoice-expired'
  | 'quote-expired'
  | 'expires-soon'
  | 'unpinned-signer'
  | 'chain-mismatch'
  | 'test-invoice-in-live-mode'
  | 'live-invoice-in-test-mode'
  | 'test-chain-without-marker'
  | 'unencrypted-private-part';

export type Severity = 'info' | 'warn' | 'block';

export interface VerdictWarning {
  readonly code: WarningCode;
  readonly severity: Severity;
}

export interface VerifyOptions {
  /** Current unix time in whole seconds. Required: the function never reads a clock. */
  readonly nowSeconds: number;
  /** Lowercase 66-hex signer keys the caller trusts (only used by {@link verifyFragment}). */
  readonly pinnedSigners?: readonly string[];
  /** If set, an invoice for any other chain id is blocked. */
  readonly expectedChainId?: number;
  /** `live` (default) blocks test invoices; `test` blocks live ones; `any` allows both. */
  readonly mode?: 'live' | 'test' | 'any';
}

/** Structured, UI-ready verification result. */
export interface Verdict {
  /** True only when there are no `block` warnings. Not a statement about the seller's identity. */
  readonly ok: boolean;
  readonly signature: 'valid' | 'invalid';
  readonly trust: TrustLevel;
  /** UIs may say "verified seller" only when this is true (valid signature AND pinned key). */
  readonly mayShowVerifiedSeller: boolean;
  readonly expired: boolean;
  readonly quoteExpired: boolean;
  readonly secondsRemaining: number;
  readonly test: boolean;
  readonly warnings: readonly VerdictWarning[];
  readonly blockers: readonly WarningCode[];
}

/** Result of {@link verifyFragment}: either a verdict with the invoice, or a coarse parse failure. */
export type FragmentVerification =
  | { readonly parsed: true; readonly invoice: Invoice; readonly verdict: Verdict }
  | { readonly parsed: false; readonly invoiceCode: string; readonly verdict: undefined };

function inTestRange(chainId: number): boolean {
  return chainId >= TEST_CHAIN_ID_MIN && chainId <= TEST_CHAIN_ID_MAX;
}

/**
 * Pure verdict over an already parsed invoice. No network, no clock, no randomness.
 *
 * @remarks Blockers: invalid signature, expired invoice, chain mismatch, and test/live
 * mixing (default mode `live` blocks reserved test chain ids). A valid signature proves
 * integrity under the embedded key only; seller identity requires a pinned key
 * (`trust === 'trusted-seller'`). `quote-expired` and `expires-soon` are warnings, not blockers.
 *
 * @param parsed Result of `parseFragment` (its `trust` is re-derived, never assumed).
 * @param options Clock value and policy.
 * @returns Verdict with deterministic warning order.
 * @throws {SdkInvoiceError} If `nowSeconds` is not a non-negative safe integer.
 * @security Fails closed: any invalid signature yields `ok: false`. Treat `ok: true` as "no known problem", never as "safe seller".
 * @testVector verdict-matrix
 */
export function verifyInvoice(parsed: ParsedInvoice, options: Omit<VerifyOptions, 'pinnedSigners'>): Verdict {
  const { invoice, verification } = parsed;
  const expiry = wrapInvoice(() => checkExpiry(invoice, options.nowSeconds));
  const mode = options.mode ?? 'live';
  const testChain = inTestRange(invoice.chainId);
  const marked = invoice.memo?.startsWith(TEST_MEMO_PREFIX) === true;
  const test = testChain && marked;
  const w: VerdictWarning[] = [];
  const add = (code: WarningCode, severity: Severity): void => void w.push({ code, severity });

  const valid = verification.signatureValid;
  if (!valid) add('invalid-signature', 'block');
  if (expiry.invoiceExpired) add('invoice-expired', 'block');
  if (options.expectedChainId !== undefined && options.expectedChainId !== invoice.chainId) add('chain-mismatch', 'block');
  if (testChain && mode === 'live') add('test-invoice-in-live-mode', 'block');
  if (!testChain && mode === 'test') add('live-invoice-in-test-mode', 'block');
  if (testChain && !marked) add('test-chain-without-marker', 'warn');
  if (!expiry.invoiceExpired && expiry.quoteExpired) add('quote-expired', 'warn');
  if (!expiry.invoiceExpired && expiry.secondsRemaining < EXPIRES_SOON_SECONDS) add('expires-soon', 'warn');
  if (valid && !verification.signerPinned) add('unpinned-signer', 'warn');
  if (!parsed.encrypted && invoice.lineItems.length > 0) add('unencrypted-private-part', 'info');

  const blockers = w.filter((x) => x.severity === 'block').map((x) => x.code);
  const trust: TrustLevel = !valid ? 'invalid-signature' : verification.signerPinned ? 'trusted-seller' : 'valid-signature';
  return {
    ok: blockers.length === 0,
    signature: valid ? 'valid' : 'invalid',
    trust,
    mayShowVerifiedSeller: trust === 'trusted-seller',
    expired: expiry.invoiceExpired,
    quoteExpired: expiry.quoteExpired,
    secondsRemaining: expiry.secondsRemaining,
    test,
    warnings: w,
    blockers,
  };
}

/**
 * Parses a `#gpi=v1.` fragment and verifies it in one step, without throwing on bad input.
 *
 * @param fragment Fragment string (bearer secret: never log it).
 * @param options Clock, pinned signers and policy.
 * @returns `parsed: false` with the invoice-schema error code, or the invoice plus its verdict.
 * @throws {SdkInvoiceError} Only if `nowSeconds` is invalid.
 * @security Parse failures (including unexpected ones, as `UNKNOWN`) are reported by code only (no input echoed) and never yield a verdict. No network is used.
 * @testVector verdict-matrix
 */
export async function verifyFragment(fragment: string, options: VerifyOptions): Promise<FragmentVerification> {
  let parsed: ParsedInvoice;
  try {
    parsed = await parseFragment(fragment, options.pinnedSigners === undefined ? {} : { pinnedSigners: options.pinnedSigners });
  } catch (e) {
    return { parsed: false, invoiceCode: e instanceof InvoiceError ? e.code : 'UNKNOWN', verdict: undefined };
  }
  return { parsed: true, invoice: parsed.invoice, verdict: verifyInvoice(parsed, options) };
}
