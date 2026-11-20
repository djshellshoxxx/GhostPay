import { decodeBase64Url } from './base64url.js';
import { FRAGMENT_PREFIX, MAX_DECODED_BYTES } from './envelope.js';
import { InvoiceError } from './errors.js';
import { parseStrictJson } from './json.js';

/** Public request-file transport tag. It does not assert invoice authenticity. */
export const PAYMENT_REQUEST_FILE_FORMAT = 'ghostpay-payment-request' as const;
export const PAYMENT_REQUEST_FILE_VERSION = 1 as const;
/** Includes the JSON wrapper and any formatting whitespace. */
export const MAX_PAYMENT_REQUEST_FILE_BYTES = 24 * 1024;
/** Never put invoice details or user-provided labels in the download filename. */
export const PAYMENT_REQUEST_FILE_NAME = 'ghostpay-request.gpr.json';

export interface PaymentRequestFile {
  readonly format: typeof PAYMENT_REQUEST_FILE_FORMAT;
  readonly version: typeof PAYMENT_REQUEST_FILE_VERSION;
  /** Exact original fragment. Opening and authenticating it remain a separate step. */
  readonly fragment: string;
}

/** Fixed diagnostics: no filename, fragment, parsed value or underlying exception is retained. */
export class PaymentRequestFileError extends InvoiceError {
  public readonly reason: 'format' | 'size';

  public constructor(reason: 'format' | 'size' = 'format') {
    super(
      reason === 'size' ? 'FRAGMENT_TOO_LARGE' : 'FRAGMENT_FORMAT',
      reason === 'size' ? 'payment request file exceeds the size limit' : 'invalid payment request file',
    );
    this.reason = reason;
  }
}

const MAX_ENCODED_CHARS = Math.ceil((MAX_DECODED_BYTES * 4) / 3);

/** Transport-only validation. Never decode JSON, decrypt or verify an invoice here. */
function validateFragment(fragment: unknown): asserts fragment is string {
  if (typeof fragment !== 'string') throw new PaymentRequestFileError();
  if (fragment.length > FRAGMENT_PREFIX.length + MAX_ENCODED_CHARS) throw new PaymentRequestFileError('size');
  if (!fragment.startsWith(FRAGMENT_PREFIX)) throw new PaymentRequestFileError();
  const encoded = fragment.slice(FRAGMENT_PREFIX.length);
  if (encoded.length === 0) throw new PaymentRequestFileError();
  let decoded: Uint8Array;
  try {
    decoded = decodeBase64Url(encoded);
  } catch {
    throw new PaymentRequestFileError();
  }
  if (decoded.byteLength > MAX_DECODED_BYTES) throw new PaymentRequestFileError('size');
}

/**
 * Wraps the exact existing invoice fragment in deterministic UTF-8 JSON for a local file.
 *
 * @param fragment Original `#gpi=v1.` fragment, never a URL or a decrypted invoice.
 * @returns JSON containing only format, version and the unchanged fragment; no trailing newline.
 * @throws {PaymentRequestFileError} On invalid transport encoding or an oversized envelope.
 * @security Adds no encryption or authenticity. Callers must keep the file private and send any
 * passphrase separately. No network, storage, DOM, signing or decryption occurs here.
 */
export function serializePaymentRequestFile(fragment: string): string {
  validateFragment(fragment);
  // All accepted values are ASCII; the bounded envelope plus this fixed wrapper fits within 24 KiB.
  return JSON.stringify({
    format: PAYMENT_REQUEST_FILE_FORMAT,
    version: PAYMENT_REQUEST_FILE_VERSION,
    fragment,
  });
}

/**
 * Parses a bounded request-file wrapper without authenticating or altering its invoice.
 *
 * @param text File bytes already decoded as strict UTF-8 by the caller.
 * @returns Only the three declared transport fields. Formatting whitespace is accepted.
 * @throws {PaymentRequestFileError} On invalid JSON, schema, transport encoding or size.
 * @security A parsed file is untrusted. Pass the unchanged fragment to `openFragment` and retain
 * its signature, pinning, passphrase, expiry and payment-review checks. Never log this input.
 */
export function parsePaymentRequestFile(text: string): PaymentRequestFile {
  if (typeof text !== 'string') throw new PaymentRequestFileError();
  // The cheap character bound avoids allocating an encoder result for arbitrarily large input.
  if (text.length > MAX_PAYMENT_REQUEST_FILE_BYTES
    || new TextEncoder().encode(text).byteLength > MAX_PAYMENT_REQUEST_FILE_BYTES) {
    throw new PaymentRequestFileError('size');
  }
  let parsed: unknown;
  try {
    parsed = parseStrictJson(text);
  } catch {
    throw new PaymentRequestFileError();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new PaymentRequestFileError();
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 3
    || record['format'] !== PAYMENT_REQUEST_FILE_FORMAT
    || record['version'] !== PAYMENT_REQUEST_FILE_VERSION) {
    throw new PaymentRequestFileError();
  }
  const fragment = record['fragment'];
  validateFragment(fragment);
  return { format: PAYMENT_REQUEST_FILE_FORMAT, version: PAYMENT_REQUEST_FILE_VERSION, fragment };
}
