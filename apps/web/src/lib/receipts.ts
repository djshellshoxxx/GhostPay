import { LocalizedTypeError } from './errors';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { FRAGMENT_PREFIX, MAX_DECODED_BYTES, canonicalize, checkExpiry, invoiceDigest, parseStrictJson, signerPublicKeyHex, verifyInvoiceSignature, type ParsedInvoice } from '@ghostpay/invoice-schema';
import { checkAnnouncement, encodeMetaAddress, type StealthKeySet } from '@ghostpay/core-crypto';
import { grossForNet, routerSplit } from '@ghostpay/chain-adapters';
import type { ScanMatch } from './scanClient';

/** Domain separation keeps a payment receipt signature distinct from every other GhostPay signature. */
export const RECEIPT_DOMAIN = 'GhostPay/receipt/v1\n';

export interface ReceiptPayload {
  readonly version: 1;
  readonly invoiceDigest: string;
  readonly chainId: number;
  readonly txHash: string;
  readonly stealthAddress: string;
  /** `native` or the canonical lowercase token contract address. */
  readonly asset: string;
  /** Exact positive token base units, represented as a decimal integer string. */
  readonly amountMinorUnits: string;
  /** Unix time in seconds. */
  readonly issuedAt: number;
  readonly signerPublicKey: string;
}

export interface SignedReceipt extends ReceiptPayload {
  readonly signature: string;
}

export interface ReceiptInvoiceBinding {
  readonly invoiceDigest: string;
  readonly chainId: number;
  readonly asset: string;
  readonly amountMinorUnits: string;
  readonly invoiceSignerPublicKey: string;
  readonly invoiceSignatureValid: boolean;
  /** A public key the user has already verified out of band; never inferred from receipt content. */
  readonly trustedSignerPublicKey?: string;
  readonly txHash?: string;
  readonly stealthAddress?: string;
}

export interface BoundReceipt {
  readonly receipt: SignedReceipt;
  readonly signerMatch: 'invoice-signing-key' | 'explicitly-trusted-key';
}

const DIGEST = /^0x[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const PUBKEY = /^[0-9a-f]{66}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const AMOUNT = /^[1-9][0-9]{0,77}$/;
const MAX_AMOUNT = (1n << 256n) - 1n;
export const MAX_RECEIPT_JSON_BYTES = 65_536;
/** Bound the encoded envelope and a reasonable URL wrapper before parsing or file allocation. */
export const MAX_RECEIPT_INVOICE_BYTES = Math.ceil(MAX_DECODED_BYTES * 4 / 3) + 2048;
const PAYLOAD_KEYS = ['amountMinorUnits', 'asset', 'chainId', 'invoiceDigest', 'issuedAt', 'signerPublicKey', 'stealthAddress', 'txHash', 'version'] as const;
const RECEIPT_KEYS = [...PAYLOAD_KEYS, 'signature'] as const;

/** Read a signed invoice locally. A URL is never opened or fetched. */
export function receiptInvoiceFragment(text: string): string {
  if (text.length > MAX_RECEIPT_INVOICE_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECEIPT_INVOICE_BYTES) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLarge' });
  const input = text.trim();
  let fragment = input;
  if (!input.startsWith(FRAGMENT_PREFIX)) {
    let url: URL;
    try { url = new URL(input); } catch { throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' }); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' });
    fragment = url.hash;
  }
  if (!fragment.startsWith(FRAGMENT_PREFIX) || /\s/.test(fragment)) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceLink' });
  return fragment;
}

/** Match an actual signed fixed-token invoice to verified scan facts without storing borrowed secrets. */
export function receiptBindingForInvoice(parsed: ParsedInvoice, match: ScanMatch, signerPublicKey: string, keys: StealthKeySet, nowSeconds: number): ReceiptInvoiceBinding {
  const invoice = parsed.invoice;
  if (!parsed.verification.signatureValid || !verifyInvoiceSignature(parsed)) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceSignature' });
  if (invoice.signer !== signerPublicKey) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceSignerMismatch' });
  if (invoice.metaAddress.toLowerCase() !== encodeMetaAddress(keys).toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceRecipientMismatch' });
  if (checkExpiry(invoice, nowSeconds).invoiceExpired) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceExpired' });
  if (match.receipt !== 'verified' || !match.viaRouter || match.metadata === undefined || match.announcement.transactionHash === undefined) throw new LocalizedTypeError({ key: 'receipt.validation.completePayment' });
  if (invoice.chainId !== match.chainId) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceChainMismatch' });
  const asset = match.metadata.kind === 'native' ? 'native' : match.metadata.token.toLowerCase();
  if (invoice.token.toLowerCase() !== asset) throw new LocalizedTypeError({ key: 'receipt.validation.invoiceAssetMismatch' });
  if (invoice.amountPolicy.mode !== 'fixed_token') throw new LocalizedTypeError({ key: 'receipt.validation.fixedToken' });
  const wanted = BigInt(invoice.amountPolicy.tokenAmount);
  const expected = routerSplit(invoice.feePolicy === 'payer_pays' ? grossForNet(wanted) : wanted).net;
  if (match.metadata.netAmount !== expected) throw new LocalizedTypeError({ key: 'receipt.validation.sellerAmountMismatch' });
  if (match.announcement.stealthAddress?.toLowerCase() !== match.stealthAddress.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.scanRecipientInconsistent' });
  const recipient = checkAnnouncement(match.announcement, keys.viewingSecret, keys.spendingPublicKey, { ignoreViewTag: !match.tagMatches });
  if (!recipient.matches || recipient.stealthAddress.toLowerCase() !== match.stealthAddress.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.scanRecipientMismatch' });
  return {
    invoiceDigest: `0x${bytesToHex(invoiceDigest(invoice))}`,
    chainId: invoice.chainId,
    asset,
    amountMinorUnits: expected.toString(),
    invoiceSignerPublicKey: invoice.signer,
    invoiceSignatureValid: true,
    txHash: match.announcement.transactionHash.toLowerCase(),
    stealthAddress: match.stealthAddress.toLowerCase(),
  };
}

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new LocalizedTypeError({ key: 'receipt.error.object', values: { name } });
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) throw new LocalizedTypeError({ key: 'receipt.error.plainObject', values: { name } });
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) throw new LocalizedTypeError({ key: 'receipt.error.schema', values: { name } });
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new LocalizedTypeError({ key: 'receipt.error.schema', values: { name } });
  return value as Record<string, unknown>;
}

/** Strictly validates and canonicalizes the signed receipt payload. */
export function validateReceiptPayload(value: unknown): ReceiptPayload {
  const o = record(value, PAYLOAD_KEYS, 'Receipt payload');
  if (o.version !== 1) throw new LocalizedTypeError({ key: 'receipt.validation.version' });
  if (typeof o.invoiceDigest !== 'string' || !DIGEST.test(o.invoiceDigest)) throw new LocalizedTypeError({ key: 'receipt.validation.digest' });
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) throw new LocalizedTypeError({ key: 'receipt.validation.chain' });
  if (typeof o.txHash !== 'string' || !HASH.test(o.txHash)) throw new LocalizedTypeError({ key: 'receipt.validation.txHash' });
  if (typeof o.stealthAddress !== 'string' || !ADDRESS.test(o.stealthAddress)) throw new LocalizedTypeError({ key: 'receipt.validation.stealthAddress' });
  if (typeof o.asset !== 'string' || (o.asset !== 'native' && !ADDRESS.test(o.asset))) throw new LocalizedTypeError({ key: 'receipt.validation.asset' });
  if (typeof o.amountMinorUnits !== 'string' || !AMOUNT.test(o.amountMinorUnits)) throw new LocalizedTypeError({ key: 'receipt.validation.amount' });
  if (BigInt(o.amountMinorUnits) > MAX_AMOUNT) throw new LocalizedTypeError({ key: 'receipt.validation.amountRange' });
  if (!Number.isSafeInteger(o.issuedAt) || (o.issuedAt as number) <= 0) throw new LocalizedTypeError({ key: 'receipt.validation.issueTime' });
  if (typeof o.signerPublicKey !== 'string' || !PUBKEY.test(o.signerPublicKey)) throw new LocalizedTypeError({ key: 'receipt.validation.signerKey' });
  secp256k1.Point.fromHex(o.signerPublicKey);
  // All public values use one representation, avoiding semantically equivalent signed variants.
  if (o.invoiceDigest !== o.invoiceDigest.toLowerCase() || o.txHash !== o.txHash.toLowerCase() ||
      o.stealthAddress !== o.stealthAddress.toLowerCase() || o.asset !== o.asset.toLowerCase() ||
      o.signerPublicKey !== o.signerPublicKey.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.lowercase' });
  return {
    version: 1,
    invoiceDigest: o.invoiceDigest,
    chainId: o.chainId as number,
    txHash: o.txHash,
    stealthAddress: o.stealthAddress,
    asset: o.asset,
    amountMinorUnits: o.amountMinorUnits,
    issuedAt: o.issuedAt as number,
    signerPublicKey: o.signerPublicKey,
  };
}

/** Canonical signed bytes for one receipt payload (sorted keys, no whitespace). */
export function canonicalReceiptPayload(payload: ReceiptPayload): string {
  return canonicalize(validateReceiptPayload(payload));
}

/** Domain-separated Keccak digest for receipt signatures. */
export function receiptDigest(payload: ReceiptPayload): Uint8Array {
  return keccak_256(concatBytes(utf8ToBytes(RECEIPT_DOMAIN), utf8ToBytes(canonicalReceiptPayload(payload))));
}

/** Creates a seller-key attestation. This proves control of the included key, not seller identity or payment independently. */
export function signReceipt(payload: Omit<ReceiptPayload, 'signerPublicKey' | 'version'>, signingKey: Uint8Array): SignedReceipt {
  const signerPublicKey = signerPublicKeyHex(signingKey);
  const clean = validateReceiptPayload({ ...payload, signerPublicKey, version: 1 });
  const signature = bytesToHex(secp256k1.sign(receiptDigest(clean), signingKey, { prehash: false, lowS: true }));
  return { ...clean, signature };
}

/** Returns false for malformed or tampered receipts; accepts no unknown fields. */
export function verifyReceipt(value: unknown): value is SignedReceipt {
  try {
    const o = record(value, RECEIPT_KEYS, 'Receipt');
    const payload = validateReceiptPayload(Object.fromEntries(PAYLOAD_KEYS.map((key) => [key, o[key]])));
    if (typeof o.signature !== 'string' || !SIGNATURE.test(o.signature)) return false;
    return secp256k1.verify(hexToBytes(o.signature), receiptDigest(payload), hexToBytes(payload.signerPublicKey), { prehash: false, lowS: true });
  } catch {
    return false;
  }
}

/**
 * Verify a seller attestation against the currently opened invoice and expected payment facts.
 * This establishes key control and field consistency only; it does not independently prove an on-chain payment.
 */
export function bindReceiptToInvoice(value: unknown, binding: ReceiptInvoiceBinding): BoundReceipt {
  if (!verifyReceipt(value)) throw new LocalizedTypeError({ key: 'receipt.validation.signature' });
  const receipt = value;
  if (receipt.invoiceDigest !== binding.invoiceDigest.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.otherInvoice' });
  if (receipt.chainId !== binding.chainId) throw new LocalizedTypeError({ key: 'receipt.validation.receiptChainMismatch' });
  if (receipt.asset !== binding.asset.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.receiptAssetMismatch' });
  if (receipt.amountMinorUnits !== binding.amountMinorUnits) throw new LocalizedTypeError({ key: 'receipt.validation.receiptAmountMismatch' });
  if (binding.txHash !== undefined && receipt.txHash !== binding.txHash.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.receiptTxMismatch' });
  if (binding.stealthAddress !== undefined && receipt.stealthAddress !== binding.stealthAddress.toLowerCase()) throw new LocalizedTypeError({ key: 'receipt.validation.receiptRecipientMismatch' });

  const matchesInvoiceKey = binding.invoiceSignatureValid && receipt.signerPublicKey === binding.invoiceSignerPublicKey.toLowerCase();
  const trustedKey = binding.trustedSignerPublicKey?.trim().toLowerCase();
  if (trustedKey !== undefined && !PUBKEY.test(trustedKey)) throw new LocalizedTypeError({ key: 'receipt.validation.trustedKey' });
  const matchesExplicitKey = trustedKey !== undefined && receipt.signerPublicKey === trustedKey;
  if (!matchesInvoiceKey && !matchesExplicitKey) throw new LocalizedTypeError({ key: 'receipt.validation.signerMismatch' });
  return { receipt, signerMatch: matchesExplicitKey ? 'explicitly-trusted-key' : 'invoice-signing-key' };
}

/** Parses a receipt export and requires a valid signature. */
export function parseVerifiedReceipt(text: string): SignedReceipt {
  if (new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) {
    throw new LocalizedTypeError({ key: 'receipt.validation.fileLarge' });
  }
  const parsed = parseStrictJson(text);
  if (!verifyReceipt(parsed)) throw new LocalizedTypeError({ key: 'receipt.validation.malformed' });
  return parsed;
}

/** Deterministic JSON export. */
export function receiptJson(receipt: SignedReceipt): string {
  if (!verifyReceipt(receipt)) throw new LocalizedTypeError({ key: 'receipt.validation.exportInvalid' });
  return canonicalize(receipt);
}

// i18n-use: receipt.validation.invoiceLarge receipt.validation.invoiceLink receipt.validation.invoiceSignature receipt.validation.invoiceSignerMismatch receipt.validation.invoiceRecipientMismatch receipt.validation.invoiceExpired receipt.validation.completePayment receipt.validation.invoiceChainMismatch receipt.validation.invoiceAssetMismatch receipt.validation.fixedToken receipt.validation.sellerAmountMismatch receipt.validation.scanRecipientInconsistent receipt.validation.scanRecipientMismatch receipt.error.object receipt.error.plainObject receipt.error.schema receipt.validation.version receipt.validation.digest receipt.validation.chain receipt.validation.txHash receipt.validation.stealthAddress receipt.validation.asset receipt.validation.amount receipt.validation.amountRange receipt.validation.issueTime receipt.validation.signerKey receipt.validation.lowercase receipt.validation.signature receipt.validation.otherInvoice receipt.validation.receiptChainMismatch receipt.validation.receiptAssetMismatch receipt.validation.receiptAmountMismatch receipt.validation.receiptTxMismatch receipt.validation.receiptRecipientMismatch receipt.validation.trustedKey receipt.validation.signerMismatch receipt.validation.fileLarge receipt.validation.malformed receipt.validation.exportInvalid
