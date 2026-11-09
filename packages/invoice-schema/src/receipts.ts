import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalize, parseStrictJson } from './json.js';
import { signerPublicKeyHex } from './sign.js';

/** Stable validation codes; messages never include supplied receipt data. */
export type SignedReceiptErrorCode = 'OBJECT' | 'PLAIN_OBJECT' | 'SCHEMA' | 'VERSION' | 'DIGEST' | 'CHAIN' | 'TX_HASH' | 'STEALTH_ADDRESS' | 'ASSET' | 'AMOUNT' | 'AMOUNT_RANGE' | 'ISSUE_TIME' | 'SIGNER_KEY' | 'LOWERCASE' | 'SIGNATURE' | 'OTHER_INVOICE' | 'RECEIPT_CHAIN_MISMATCH' | 'RECEIPT_ASSET_MISMATCH' | 'RECEIPT_AMOUNT_MISMATCH' | 'RECEIPT_TX_MISMATCH' | 'RECEIPT_RECIPIENT_MISMATCH' | 'TRUSTED_KEY' | 'SIGNER_MISMATCH' | 'FILE_LARGE' | 'MALFORMED' | 'EXPORT_INVALID';
export class SignedReceiptError extends TypeError {
  public constructor(public readonly code: SignedReceiptErrorCode, public readonly values?: Readonly<{ name: string }>) {
    super(`Receipt validation failed (${code}).`);
    this.name = 'SignedReceiptError';
  }
}

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
const PAYLOAD_KEYS = ['amountMinorUnits', 'asset', 'chainId', 'invoiceDigest', 'issuedAt', 'signerPublicKey', 'stealthAddress', 'txHash', 'version'] as const;
const RECEIPT_KEYS = [...PAYLOAD_KEYS, 'signature'] as const;

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SignedReceiptError('OBJECT', { name });
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) throw new SignedReceiptError('PLAIN_OBJECT', { name });
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) throw new SignedReceiptError('SCHEMA', { name });
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new SignedReceiptError('SCHEMA', { name });
  return value as Record<string, unknown>;
}

/** Strictly validates and canonicalizes the signed receipt payload. */
export function validateReceiptPayload(value: unknown): ReceiptPayload {
  const o = record(value, PAYLOAD_KEYS, 'Receipt payload');
  if (o.version !== 1) throw new SignedReceiptError('VERSION');
  if (typeof o.invoiceDigest !== 'string' || !DIGEST.test(o.invoiceDigest)) throw new SignedReceiptError('DIGEST');
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) throw new SignedReceiptError('CHAIN');
  if (typeof o.txHash !== 'string' || !HASH.test(o.txHash)) throw new SignedReceiptError('TX_HASH');
  if (typeof o.stealthAddress !== 'string' || !ADDRESS.test(o.stealthAddress)) throw new SignedReceiptError('STEALTH_ADDRESS');
  if (typeof o.asset !== 'string' || (o.asset !== 'native' && !ADDRESS.test(o.asset))) throw new SignedReceiptError('ASSET');
  if (typeof o.amountMinorUnits !== 'string' || !AMOUNT.test(o.amountMinorUnits)) throw new SignedReceiptError('AMOUNT');
  if (BigInt(o.amountMinorUnits) > MAX_AMOUNT) throw new SignedReceiptError('AMOUNT_RANGE');
  if (!Number.isSafeInteger(o.issuedAt) || (o.issuedAt as number) <= 0) throw new SignedReceiptError('ISSUE_TIME');
  if (typeof o.signerPublicKey !== 'string' || !PUBKEY.test(o.signerPublicKey)) throw new SignedReceiptError('SIGNER_KEY');
  secp256k1.Point.fromHex(o.signerPublicKey);
  // All public values use one representation, avoiding semantically equivalent signed variants.
  if (o.invoiceDigest !== o.invoiceDigest.toLowerCase() || o.txHash !== o.txHash.toLowerCase() ||
      o.stealthAddress !== o.stealthAddress.toLowerCase() || o.asset !== o.asset.toLowerCase() ||
      o.signerPublicKey !== o.signerPublicKey.toLowerCase()) throw new SignedReceiptError('LOWERCASE');
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
  if (!verifyReceipt(value)) throw new SignedReceiptError('SIGNATURE');
  const receipt = value;
  if (receipt.invoiceDigest !== binding.invoiceDigest.toLowerCase()) throw new SignedReceiptError('OTHER_INVOICE');
  if (receipt.chainId !== binding.chainId) throw new SignedReceiptError('RECEIPT_CHAIN_MISMATCH');
  if (receipt.asset !== binding.asset.toLowerCase()) throw new SignedReceiptError('RECEIPT_ASSET_MISMATCH');
  if (receipt.amountMinorUnits !== binding.amountMinorUnits) throw new SignedReceiptError('RECEIPT_AMOUNT_MISMATCH');
  if (binding.txHash !== undefined && receipt.txHash !== binding.txHash.toLowerCase()) throw new SignedReceiptError('RECEIPT_TX_MISMATCH');
  if (binding.stealthAddress !== undefined && receipt.stealthAddress !== binding.stealthAddress.toLowerCase()) throw new SignedReceiptError('RECEIPT_RECIPIENT_MISMATCH');

  const matchesInvoiceKey = binding.invoiceSignatureValid && receipt.signerPublicKey === binding.invoiceSignerPublicKey.toLowerCase();
  const trustedKey = binding.trustedSignerPublicKey?.trim().toLowerCase();
  if (trustedKey !== undefined && !PUBKEY.test(trustedKey)) throw new SignedReceiptError('TRUSTED_KEY');
  const matchesExplicitKey = trustedKey !== undefined && receipt.signerPublicKey === trustedKey;
  if (!matchesInvoiceKey && !matchesExplicitKey) throw new SignedReceiptError('SIGNER_MISMATCH');
  return { receipt, signerMatch: matchesExplicitKey ? 'explicitly-trusted-key' : 'invoice-signing-key' };
}

/** Parses a receipt export and requires a valid signature. */
export function parseVerifiedReceipt(text: string): SignedReceipt {
  if (new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) {
    throw new SignedReceiptError('FILE_LARGE');
  }
  const parsed = parseStrictJson(text);
  if (!verifyReceipt(parsed)) throw new SignedReceiptError('MALFORMED');
  return parsed;
}

/** Deterministic JSON export. */
export function receiptJson(receipt: SignedReceipt): string {
  if (!verifyReceipt(receipt)) throw new SignedReceiptError('EXPORT_INVALID');
  return canonicalize(receipt);
}

