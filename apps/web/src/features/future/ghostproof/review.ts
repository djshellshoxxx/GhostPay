import {
  bindReceiptToInvoice, MAX_RECEIPT_JSON_BYTES, parseStrictJson, verifyReceipt as verifySignedReceipt,
  type ReceiptInvoiceBinding, type SignedReceipt,
} from '@ghostpay/invoice-schema';
import {
  MAX_RECEIPT_CHARS, parseReceipt, verifyReceipt as verifyDigestReceipt, type Receipt,
} from '@ghostpay/ux-receipts';

/** These receipt formats do not implement audience-bound or zero-knowledge proofs. */
export const UNSUPPORTED_RECEIPT_CLAIMS = Object.freeze([
  'payment-finality', 'funds-ownership', 'audience-bound-proof', 'zero-knowledge',
] as const);
export type ReceiptClaim = 'receipt-integrity' | 'signed-statement' | 'invoice-bound-statement'
  | typeof UNSUPPORTED_RECEIPT_CLAIMS[number];
export type ReceiptReviewError = 'INVALID_CONTEXT' | 'TOO_LARGE' | 'MALFORMED'
  | 'UNSUPPORTED_FORMAT' | 'UNSUPPORTED_CLAIM' | 'INVALID_RECEIPT' | 'BINDING_REQUIRED'
  | 'BINDING_UNAVAILABLE' | 'BINDING_MISMATCH' | 'VERIFIER_UNAVAILABLE' | 'CANCELLED' | 'DISPOSED';
export type ReceiptCaveat = 'digest-not-signature' | 'embedded-key-not-identity'
  | 'invoice-key-not-identity' | 'trusted-key-is-caller-supplied' | 'invoice-not-checked'
  | 'statement-not-payment-evidence' | 'chain-and-freshness-not-checked'
  | 'no-audience-or-challenge-binding' | 'disclosed-facts-can-be-copied';

export interface DisclosureField {
  readonly name: string;
  /** Plain text only; never interpret as HTML or a URL to fetch. */
  readonly value: string;
}

export interface ReceiptReview {
  readonly format: 'digest-receipt-v1' | 'signed-receipt-v1';
  readonly assurance: 'self_consistent_unverified' | 'signed_statement';
  readonly signerTrust: 'not-present' | 'embedded-key-only' | 'invoice-signing-key' | 'explicitly-trusted-key';
  readonly invoiceBinding: 'not-checked' | 'matched';
  /** Reports the supplied context; this adapter does not parse or verify a separate invoice. */
  readonly invoiceAuthentication: 'not-checked' | 'caller-verified' | 'not-verified';
  readonly chain: 'not-checked';
  readonly freshness: 'unknown';
  readonly fields: readonly DisclosureField[];
  readonly caveats: readonly ReceiptCaveat[];
  readonly unsupportedClaims: typeof UNSUPPORTED_RECEIPT_CLAIMS;
}

export type ReceiptReviewResult =
  | { readonly ok: true; readonly review: ReceiptReview }
  | { readonly ok: false; readonly code: ReceiptReviewError };

export interface ReceiptReviewOptions {
  /** Epoch milliseconds from the composition root; a NaN or missing clock is rejected. */
  readonly nowMs: number;
  /** Abort on lock, identity change or cancellation. */
  readonly signal: AbortSignal;
  /** Locally verified invoice context; never manufacture this from imported receipt fields. */
  readonly invoiceBinding?: ReceiptInvoiceBinding;
  readonly claim?: ReceiptClaim;
}

export const failedReview = (code: ReceiptReviewError): ReceiptReviewResult => Object.freeze({ ok: false, code });
const SKEW_MS = 300_000;
const OPTIONS = new Set(['nowMs', 'signal', 'invoiceBinding', 'claim']);
const BINDING_REQUIRED = ['invoiceDigest', 'chainId', 'asset', 'amountMinorUnits', 'invoiceSignerPublicKey', 'invoiceSignatureValid'] as const;
const BINDING_KEYS = new Set<string>([...BINDING_REQUIRED, 'trustedSignerPublicKey', 'txHash', 'stealthAddress']);
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PUBKEY = /^(02|03)[0-9a-fA-F]{64}$/;
const AMOUNT = /^[1-9][0-9]{0,77}$/;
const matchesEntire = (pattern: RegExp, value: string): boolean => pattern.exec(value)?.[0] === value;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function copyBinding(value: unknown): ReceiptInvoiceBinding | undefined {
  if (value === undefined) return undefined;
  if (!plainRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !BINDING_KEYS.has(key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !('value' in descriptor))
    || BINDING_REQUIRED.some(key => !Object.hasOwn(value, key))) throw new TypeError('Invalid binding');
  if (typeof value.invoiceDigest !== 'string' || !matchesEntire(HEX32, value.invoiceDigest)
    || !Number.isSafeInteger(value.chainId) || (value.chainId as number) <= 0
    || typeof value.asset !== 'string' || (value.asset !== 'native' && !matchesEntire(ADDRESS, value.asset))
    || typeof value.amountMinorUnits !== 'string' || !matchesEntire(AMOUNT, value.amountMinorUnits)
    || BigInt(value.amountMinorUnits) >= (1n << 256n)
    || typeof value.invoiceSignerPublicKey !== 'string' || !matchesEntire(PUBKEY, value.invoiceSignerPublicKey)
    || typeof value.invoiceSignatureValid !== 'boolean') throw new TypeError('Invalid binding');
  if (value.trustedSignerPublicKey !== undefined && (typeof value.trustedSignerPublicKey !== 'string'
    || value.trustedSignerPublicKey.length > 128 || !matchesEntire(PUBKEY, value.trustedSignerPublicKey.trim()))) throw new TypeError('Invalid binding');
  if (value.txHash !== undefined && (typeof value.txHash !== 'string' || !matchesEntire(HEX32, value.txHash))) throw new TypeError('Invalid binding');
  if (value.stealthAddress !== undefined && (typeof value.stealthAddress !== 'string' || !matchesEntire(ADDRESS, value.stealthAddress))) throw new TypeError('Invalid binding');
  return Object.freeze({
    invoiceDigest: value.invoiceDigest, chainId: value.chainId as number, asset: value.asset,
    amountMinorUnits: value.amountMinorUnits, invoiceSignerPublicKey: value.invoiceSignerPublicKey,
    invoiceSignatureValid: value.invoiceSignatureValid,
    ...(value.trustedSignerPublicKey === undefined ? {} : { trustedSignerPublicKey: value.trustedSignerPublicKey }),
    ...(value.txHash === undefined ? {} : { txHash: value.txHash }),
    ...(value.stealthAddress === undefined ? {} : { stealthAddress: value.stealthAddress }),
  });
}

/** Internal boundary shared with the import session. Reject accessors and snapshot caller-owned terms. */
export function captureReceiptReviewOptions(options: ReceiptReviewOptions): ReceiptReviewOptions | undefined {
  try {
    if (!plainRecord(options) || Reflect.ownKeys(options).some(key => typeof key !== 'string' || !OPTIONS.has(key))
      || Object.values(Object.getOwnPropertyDescriptors(options)).some(descriptor => !('value' in descriptor))) return undefined;
    const { nowMs, signal, claim } = options;
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000
      || signal === undefined || typeof signal.aborted !== 'boolean'
      || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'
      || (claim !== undefined && typeof claim !== 'string')) return undefined;
    const invoiceBinding = copyBinding(options.invoiceBinding);
    return Object.freeze({ nowMs, signal, ...(claim === undefined ? {} : { claim }),
      ...(invoiceBinding === undefined ? {} : { invoiceBinding }),
    });
  } catch { return undefined; }
}

function field(name: string, value: string | number): DisclosureField {
  return Object.freeze({ name, value: String(value) });
}

function digestFields(receipt: Receipt): readonly DisclosureField[] {
  const fields = [field('type', receipt.type), field('v', receipt.v)];
  for (const name of ['createdAt', 'chain', 'amount', 'memo', 'txHash', 'sender', 'recipient'] as const) {
    if (receipt[name] !== undefined) fields.push(field(name, receipt[name]));
  }
  if (receipt.asset !== undefined) fields.push(field('asset.symbol', receipt.asset.symbol), field('asset.decimals', receipt.asset.decimals));
  fields.push(field('redacted', JSON.stringify(receipt.redacted)), field('digest.alg', receipt.digest.alg), field('digest.hex', receipt.digest.hex));
  return Object.freeze(fields);
}

function signedFields(receipt: SignedReceipt): readonly DisclosureField[] {
  return Object.freeze(([
    'version', 'invoiceDigest', 'chainId', 'asset', 'amountMinorUnits', 'txHash',
    'stealthAddress', 'issuedAt', 'signerPublicKey', 'signature',
  ] as const).map(name => field(name, receipt[name])));
}

function success(review: Omit<ReceiptReview, 'chain' | 'freshness' | 'unsupportedClaims'>): ReceiptReviewResult {
  return Object.freeze({ ok: true, review: Object.freeze({ ...review,
    caveats: Object.freeze(review.caveats), chain: 'not-checked', freshness: 'unknown',
    unsupportedClaims: UNSUPPORTED_RECEIPT_CLAIMS,
  }) });
}

/**
 * Verify supported local receipt formats and return an immutable disclosure review.
 * No network verifier is accepted. Signer trust and verified invoice context come from
 * the composition root, never from an imported file. Raw receipts are not retained.
 */
export async function reviewReceipt(text: unknown, options: ReceiptReviewOptions): Promise<ReceiptReviewResult> {
  const captured = captureReceiptReviewOptions(options);
  if (captured === undefined) return failedReview('INVALID_CONTEXT');
  const { signal, nowMs, invoiceBinding: binding } = captured;
  if (signal.aborted) return failedReview('CANCELLED');
  const claim = captured.claim ?? 'receipt-integrity';
  if (!['receipt-integrity', 'signed-statement', 'invoice-bound-statement'].includes(claim)) return failedReview('UNSUPPORTED_CLAIM');
  if (claim === 'invoice-bound-statement' && binding === undefined) return failedReview('BINDING_REQUIRED');
  if (typeof text !== 'string') return failedReview('MALFORMED');
  if (text.length > MAX_RECEIPT_JSON_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) return failedReview('TOO_LARGE');
  let parsed: unknown;
  try { parsed = parseStrictJson(text); } catch { return failedReview('MALFORMED'); }
  if (!plainRecord(parsed)) return failedReview('UNSUPPORTED_FORMAT');
  if (parsed.type === 'ghostpay.receipt') {
    if (text.length > MAX_RECEIPT_CHARS) return failedReview('TOO_LARGE');
    if (binding !== undefined) return failedReview('BINDING_UNAVAILABLE');
    if (claim !== 'receipt-integrity') return failedReview('UNSUPPORTED_CLAIM');
    const decoded = parseReceipt(parsed);
    if (!decoded.ok) return failedReview('INVALID_RECEIPT');
    try {
      // Deliberately supply no ChainVerifier.
      const report = await verifyDigestReceipt(decoded.receipt, { nowMs });
      if (signal.aborted) return failedReview('CANCELLED');
      if (!report.selfConsistent || report.verdict !== 'self_consistent_unverified' || report.chain.status !== 'not_checked') return failedReview('INVALID_RECEIPT');
      return success({ format: 'digest-receipt-v1', assurance: 'self_consistent_unverified',
        signerTrust: 'not-present', invoiceBinding: 'not-checked', invoiceAuthentication: 'not-checked', fields: digestFields(decoded.receipt),
        caveats: ['digest-not-signature', 'invoice-not-checked', 'statement-not-payment-evidence',
          'chain-and-freshness-not-checked', 'no-audience-or-challenge-binding', 'disclosed-facts-can-be-copied'],
      });
    } catch { return failedReview(signal.aborted ? 'CANCELLED' : 'VERIFIER_UNAVAILABLE'); }
  }
  if (!Object.hasOwn(parsed, 'version') || !Object.hasOwn(parsed, 'signature')) return failedReview('UNSUPPORTED_FORMAT');
  if (!verifySignedReceipt(parsed) || parsed.issuedAt > (nowMs + SKEW_MS) / 1000) return failedReview('INVALID_RECEIPT');
  let signerTrust: ReceiptReview['signerTrust'] = 'embedded-key-only';
  if (binding !== undefined) {
    try { signerTrust = bindReceiptToInvoice(parsed, binding).signerMatch; }
    catch { return failedReview('BINDING_MISMATCH'); }
  }
  if (signal.aborted) return failedReview('CANCELLED');
  const trustCaveat: ReceiptCaveat = signerTrust === 'explicitly-trusted-key' ? 'trusted-key-is-caller-supplied'
    : signerTrust === 'invoice-signing-key' ? 'invoice-key-not-identity' : 'embedded-key-not-identity';
  return success({ format: 'signed-receipt-v1', assurance: 'signed_statement', signerTrust,
    invoiceBinding: binding === undefined ? 'not-checked' : 'matched',
    invoiceAuthentication: binding === undefined ? 'not-checked' : binding.invoiceSignatureValid ? 'caller-verified' : 'not-verified',
    fields: signedFields(parsed),
    caveats: [trustCaveat, ...(binding === undefined ? ['invoice-not-checked' as const] : []),
      'statement-not-payment-evidence', 'chain-and-freshness-not-checked',
      'no-audience-or-challenge-binding', 'disclosed-facts-can-be-copied'],
  });
}
