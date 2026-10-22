import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalize, parseStrictJson, signerPublicKeyHex } from '@ghostpay/invoice-schema';

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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${name} must be a plain object.`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) throw new TypeError(`${name} has an invalid schema.`);
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) throw new TypeError(`${name} has an invalid schema.`);
  return value as Record<string, unknown>;
}

/** Strictly validates and canonicalizes the signed receipt payload. */
export function validateReceiptPayload(value: unknown): ReceiptPayload {
  const o = record(value, PAYLOAD_KEYS, 'Receipt payload');
  if (o.version !== 1) throw new TypeError('Receipt version is unsupported.');
  if (typeof o.invoiceDigest !== 'string' || !DIGEST.test(o.invoiceDigest)) throw new TypeError('Receipt invoice digest is invalid.');
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) throw new TypeError('Receipt chain id is invalid.');
  if (typeof o.txHash !== 'string' || !HASH.test(o.txHash)) throw new TypeError('Receipt transaction hash is invalid.');
  if (typeof o.stealthAddress !== 'string' || !ADDRESS.test(o.stealthAddress)) throw new TypeError('Receipt stealth address is invalid.');
  if (typeof o.asset !== 'string' || (o.asset !== 'native' && !ADDRESS.test(o.asset))) throw new TypeError('Receipt asset is invalid.');
  if (typeof o.amountMinorUnits !== 'string' || !AMOUNT.test(o.amountMinorUnits)) throw new TypeError('Receipt amount must be a positive decimal integer string.');
  if (BigInt(o.amountMinorUnits) > MAX_AMOUNT) throw new TypeError('Receipt amount exceeds the supported integer range.');
  if (!Number.isSafeInteger(o.issuedAt) || (o.issuedAt as number) <= 0) throw new TypeError('Receipt issue time is invalid.');
  if (typeof o.signerPublicKey !== 'string' || !PUBKEY.test(o.signerPublicKey)) throw new TypeError('Receipt signer key is invalid.');
  secp256k1.Point.fromHex(o.signerPublicKey);
  // All public values use one representation, avoiding semantically equivalent signed variants.
  if (o.invoiceDigest !== o.invoiceDigest.toLowerCase() || o.txHash !== o.txHash.toLowerCase() ||
      o.stealthAddress !== o.stealthAddress.toLowerCase() || o.asset !== o.asset.toLowerCase() ||
      o.signerPublicKey !== o.signerPublicKey.toLowerCase()) throw new TypeError('Receipt hex values must be lowercase.');
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
  if (!verifyReceipt(value)) throw new TypeError('Receipt signature is invalid.');
  const receipt = value;
  if (receipt.invoiceDigest !== binding.invoiceDigest.toLowerCase()) throw new TypeError('Receipt is for a different invoice.');
  if (receipt.chainId !== binding.chainId) throw new TypeError('Receipt chain does not match this invoice.');
  if (receipt.asset !== binding.asset.toLowerCase()) throw new TypeError('Receipt asset does not match this invoice.');
  if (receipt.amountMinorUnits !== binding.amountMinorUnits) throw new TypeError('Receipt amount does not match the expected seller amount.');
  if (binding.txHash !== undefined && receipt.txHash !== binding.txHash.toLowerCase()) throw new TypeError('Receipt transaction hash does not match this payment.');
  if (binding.stealthAddress !== undefined && receipt.stealthAddress !== binding.stealthAddress.toLowerCase()) throw new TypeError('Receipt recipient does not match this payment.');

  const matchesInvoiceKey = binding.invoiceSignatureValid && receipt.signerPublicKey === binding.invoiceSignerPublicKey.toLowerCase();
  const trustedKey = binding.trustedSignerPublicKey?.trim().toLowerCase();
  if (trustedKey !== undefined && !PUBKEY.test(trustedKey)) throw new TypeError('Trusted signer key must be a compressed public key in hex.');
  const matchesExplicitKey = trustedKey !== undefined && receipt.signerPublicKey === trustedKey;
  if (!matchesInvoiceKey && !matchesExplicitKey) throw new TypeError('Receipt signer is not the valid invoice signer or the explicitly trusted key.');
  return { receipt, signerMatch: matchesExplicitKey ? 'explicitly-trusted-key' : 'invoice-signing-key' };
}

/** Parses a receipt export and requires a valid signature. */
export function parseVerifiedReceipt(text: string): SignedReceipt {
  if (new TextEncoder().encode(text).byteLength > MAX_RECEIPT_JSON_BYTES) {
    throw new TypeError('Receipt file exceeds 64 KiB.');
  }
  const parsed = parseStrictJson(text);
  if (!verifyReceipt(parsed)) throw new TypeError('Receipt is malformed or its signature is invalid.');
  return parsed;
}

/** Deterministic JSON export. */
export function receiptJson(receipt: SignedReceipt): string {
  if (!verifyReceipt(receipt)) throw new TypeError('Cannot export an invalid receipt.');
  return canonicalize(receipt);
}
