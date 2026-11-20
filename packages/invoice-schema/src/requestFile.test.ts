import { describe, expect, it } from 'vitest';
import {
  FRAGMENT_PREFIX,
  InvoiceError,
  MAX_DECODED_BYTES,
  MAX_PAYMENT_REQUEST_FILE_BYTES,
  PAYMENT_REQUEST_FILE_FORMAT,
  PAYMENT_REQUEST_FILE_NAME,
  PAYMENT_REQUEST_FILE_VERSION,
  PaymentRequestFileError,
  encodeBase64Url,
  encodeFragment,
  openFragment,
  parsePaymentRequestFile,
  serializePaymentRequestFile,
} from './index.js';
import { sampleSigned, seededRng } from './fixtures.testutil.js';

const fragment = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode('{}'));
const wrapper = (value: unknown): string => JSON.stringify({
  format: PAYMENT_REQUEST_FILE_FORMAT,
  version: PAYMENT_REQUEST_FILE_VERSION,
  fragment: value,
});
const nonStrings: readonly unknown[] = [null, undefined, 1, true, {}, []];

function failure(run: () => unknown): PaymentRequestFileError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentRequestFileError);
    expect(error).toBeInstanceOf(InvoiceError);
    return error as PaymentRequestFileError;
  }
  throw new Error('expected request-file rejection');
}

describe('payment request file transport', () => {
  it('exports a stable generic filename and exact wrapper', () => {
    expect(PAYMENT_REQUEST_FILE_NAME).toBe('ghostpay-request.gpr.json');
    expect(PAYMENT_REQUEST_FILE_FORMAT).toBe('ghostpay-payment-request');
    expect(PAYMENT_REQUEST_FILE_VERSION).toBe(1);
    expect(MAX_PAYMENT_REQUEST_FILE_BYTES).toBe(24_576);
    expect(serializePaymentRequestFile(fragment)).toBe(wrapper(fragment));
    expect(serializePaymentRequestFile(fragment)).toBe(serializePaymentRequestFile(fragment));
    expect(parsePaymentRequestFile(wrapper(fragment))).toEqual({
      format: 'ghostpay-payment-request', version: 1, fragment,
    });
  });

  it('accepts outer JSON whitespace and key order without changing the fragment', () => {
    const text = ` \t\r\n{ "fragment": ${JSON.stringify(fragment)}, "version": 1, "format": "ghostpay-payment-request" }\n`;
    expect(parsePaymentRequestFile(text).fragment).toBe(fragment);
  });

  it.each([false, true])('preserves every byte of an existing signed fragment (encrypt=%s)', async (encrypt) => {
    const signed = sampleSigned();
    const original = await encodeFragment(signed, { encrypt, rng: seededRng('request-file') });
    const file = serializePaymentRequestFile(original);
    const parsed = parsePaymentRequestFile(file);
    expect(parsed.fragment).toBe(original);
    expect(Object.keys(parsed)).toEqual(['format', 'version', 'fragment']);
    expect(file).not.toContain(signed.invoice.memo);
    const opened = await openFragment(parsed.fragment);
    expect(opened.status).toBe('ok');
    if (opened.status !== 'ok') throw new Error('expected opened invoice');
    expect(opened.parsed.invoice).toEqual(signed.invoice);
    expect(opened.parsed.signature).toBe(signed.signature);
    expect(opened.parsed.trust).toBe('valid-signature');
  });

  it('preserves a passphrase envelope without asking for or storing the passphrase', async () => {
    const passphrase = 'local test passphrase only';
    const original = await encodeFragment(sampleSigned(), {
      passphrase, scryptN: 2 ** 15, rng: seededRng('request-file-passphrase'),
    });
    const file = serializePaymentRequestFile(original);
    expect(file).not.toContain(passphrase);
    expect(parsePaymentRequestFile(file).fragment).toBe(original);
    expect((await openFragment(parsePaymentRequestFile(file).fragment)).status).toBe('needsPassphrase');
  });

  it('keeps transport parsing separate from invoice authentication', async () => {
    const parsed = parsePaymentRequestFile(serializePaymentRequestFile(fragment));
    expect(parsed.fragment).toBe(fragment);
    await expect(openFragment(parsed.fragment)).rejects.toBeInstanceOf(InvoiceError);
  });

  it('accepts JSON string escapes without normalizing the encoded fragment value', () => {
    const text = wrapper(fragment).replace('#gpi=', '#\\u0067pi=');
    expect(parsePaymentRequestFile(text).fragment).toBe(fragment);
  });
});

describe('request-file wrapper rejection', () => {
  it.each([
    '', 'null', 'true', '1', '[]', '{}', '"request"', '{', `${wrapper(fragment)} trailing`,
    `\ufeff${wrapper(fragment)}`,
    JSON.stringify({ version: 1, fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: 1 }),
    JSON.stringify({ format: 'ghostpay-payment-request-v2', version: 1, fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: 2, fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: '1', fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: true, fragment }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: 1, fragment, invoice: {} }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: 1, fragment, origin: 'https://example.test' }),
    JSON.stringify({ format: PAYMENT_REQUEST_FILE_FORMAT, version: 1, fragment, passphrase: 'test-only' }),
    wrapper(fragment).replace('"version":1', '"version":1.0'),
    wrapper(fragment).replace('"version":1', '"version":1e0'),
    wrapper(fragment).replace('"version":1', '"version":01'),
    wrapper(fragment).replace('"version":1', '"version":-1'),
    wrapper(fragment).replace('"version":1', '"version":1,"version":1'),
    wrapper(fragment).replace('"version":1', '"version":1,"\\u0076ersion":1'),
    wrapper(fragment).replace('"version":1', '"version":1,"__proto__":{}'),
    wrapper(fragment).replace('"version":1', '"version":1,"constructor":{}'),
    wrapper(fragment).replace('"version":1', '"version":1,"prototype":{}'),
  ])('rejects malformed or non-v1 outer structure %#', (text) => {
    expect(failure(() => parsePaymentRequestFile(text)).reason).toBe('format');
  });

  it.each(nonStrings)('rejects untyped non-string fragments %#', (value) => {
    expect(failure(() => parsePaymentRequestFile(wrapper(value))).reason).toBe('format');
    expect(failure(() => serializePaymentRequestFile(value as string)).reason).toBe('format');
  });

  it.each(nonStrings)('rejects untyped non-string files %#', (value) => {
    expect(failure(() => parsePaymentRequestFile(value as string)).reason).toBe('format');
  });

  it.each([
    '', FRAGMENT_PREFIX, 'gpi=v1.e30', '#gpi=v2.e30', '#GPI=v1.e30',
    `https://example.test/${fragment}`, ` ${fragment}`, `${fragment} `, `${fragment}\n`,
    '#gpi=v1.e30=', '#gpi=v1.e30?', '#gpi=v1.A', '#gpi=v1.AB', '#gpi=v1.AAB',
    '#gpi=v1.A+', '#gpi=v1.A/', '#gpi=v1.Aé', '#gpi=v1.A\u200b', '#gpi=v1.A\ud800',
    `${fragment}#`, `${fragment}&other=value`,
  ])('rejects invalid prefixes and noncanonical base64url without repair %#', (value) => {
    expect(failure(() => parsePaymentRequestFile(wrapper(value))).reason).toBe('format');
    expect(failure(() => serializePaymentRequestFile(value)).reason).toBe('format');
  });
});

describe('request-file resource and diagnostic bounds', () => {
  it('accepts exactly the existing decoded-envelope byte limit', () => {
    const maximum = FRAGMENT_PREFIX + encodeBase64Url(new Uint8Array(MAX_DECODED_BYTES));
    const text = serializePaymentRequestFile(maximum);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(MAX_PAYMENT_REQUEST_FILE_BYTES);
    expect(parsePaymentRequestFile(text).fragment).toBe(maximum);
  });

  it('rejects one decoded envelope byte beyond the existing limit', () => {
    const oversized = FRAGMENT_PREFIX + encodeBase64Url(new Uint8Array(MAX_DECODED_BYTES + 1));
    expect(failure(() => serializePaymentRequestFile(oversized)).reason).toBe('size');
    expect(failure(() => parsePaymentRequestFile(wrapper(oversized))).reason).toBe('size');
  });

  it('accepts exactly 24 KiB of file bytes including permitted whitespace', () => {
    const text = wrapper(fragment);
    const padded = text + ' '.repeat(MAX_PAYMENT_REQUEST_FILE_BYTES - text.length);
    expect(new TextEncoder().encode(padded).byteLength).toBe(MAX_PAYMENT_REQUEST_FILE_BYTES);
    expect(parsePaymentRequestFile(padded).fragment).toBe(fragment);
    expect(failure(() => parsePaymentRequestFile(padded + ' ')).reason).toBe('size');
  });

  it('checks actual UTF-8 bytes before parsing even when character count is within the cap', () => {
    const text = 'é'.repeat(MAX_PAYMENT_REQUEST_FILE_BYTES / 2 + 1);
    expect(text.length).toBeLessThan(MAX_PAYMENT_REQUEST_FILE_BYTES);
    expect(failure(() => parsePaymentRequestFile(text)).reason).toBe('size');
  });

  it('reports fixed errors without secret text, cause or parsed payload', () => {
    const secret = 'private-invoice-test-marker';
    const errors = [
      failure(() => parsePaymentRequestFile(secret)),
      failure(() => serializePaymentRequestFile(secret)),
      failure(() => parsePaymentRequestFile(secret.repeat(MAX_PAYMENT_REQUEST_FILE_BYTES))),
    ];
    for (const error of errors) {
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(error.cause).toBeUndefined();
      expect(error.path).toBeUndefined();
      expect(error.name).toBe('PaymentRequestFileError');
    }
    expect(errors[0]?.message).toBe('invalid payment request file');
    expect(errors[0]?.code).toBe('FRAGMENT_FORMAT');
    expect(errors[2]?.message).toBe('payment request file exceeds the size limit');
    expect(errors[2]?.code).toBe('FRAGMENT_TOO_LARGE');
  });
});
