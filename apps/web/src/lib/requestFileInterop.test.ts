import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invoiceDigest, parseFragment, parsePaymentRequestFile, serializePaymentRequestFile } from '@ghostpay/invoice-schema';
import { parseInvoiceLink } from '@ghostpay/payment-uri';
import { Assembler, encodeMultipart, loadJsQrDecoder, qrMatrix, type Frame } from '@ghostpay/qr-exchange';
import { BASE_FORM, NOW } from '../test/invoiceFixtures';
import { buildInvoiceLink } from './invoiceCreate';
import { clearSession, generateSession } from './session';

const PASSPHRASE = 'cedar orbit velvet lantern meadow';
const BASE_URL = 'https://offline.example.test/GhostPay/index.html';

/** Rasterize real generated QR modules, including the quiet zone, for the independent jsQR decoder. */
function frameFor(text: string): Frame {
  const matrix = qrMatrix(text, 'M');
  const scale = 4;
  const quiet = 4;
  const width = (matrix.size + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.dark[row * matrix.size + column] !== true) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = (((row + quiet) * scale + dy) * width + (column + quiet) * scale + dx) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

beforeEach(() => { generateSession(); });
afterEach(() => { clearSession(); });

describe('F03 real file, URL and multipart QR interoperability', () => {
  it.each(['plain', 'bearer', 'passphrase'] as const)('preserves the original %s invoice through an independent QR image decoder', async (mode) => {
    const created = await buildInvoiceLink({
      ...BASE_FORM,
      token: 'native',
      tokenAmount: '0.123456789012345678',
      memo: 'Synthetic private note — do not send to a server',
      encrypt: mode === 'bearer',
      ...(mode === 'passphrase' ? { passphrase: PASSPHRASE } : {}),
    }, BASE_URL, NOW);
    const fromUrl = parseInvoiceLink(created.link, { allowedHosts: ['offline.example.test'] }).fragment;
    const file = serializePaymentRequestFile(created.fragment);
    const fromFile = parsePaymentRequestFile(file).fragment;

    // Exercise actual QR generation and image decoding, not a mock decoder that echoes its input.
    const parts = encodeMultipart(Uint8Array.from(new TextEncoder().encode(created.link)), { chunkChars: 300 });
    expect(parts.length).toBeGreaterThan(1);
    const decoder = await loadJsQrDecoder();
    const assembler = new Assembler();
    let payload: Uint8Array | undefined;
    for (const part of [...parts].reverse()) {
      const decoded = decoder.decode(frameFor(part));
      expect(decoded).toBe(part);
      if (decoded === null) throw new Error('Synthetic QR frame did not decode');
      const result = assembler.add(decoded);
      if (result.complete) payload = result.payload;
    }
    expect(payload).toBeDefined();
    const assembledLink = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    expect(assembledLink).toBe(created.link);
    const fromQr = parseInvoiceLink(assembledLink, { allowedHosts: ['offline.example.test'] }).fragment;
    expect(fromFile).toBe(created.fragment);
    expect(fromQr).toBe(fromUrl);
    expect(fromQr).toBe(fromFile);

    const options = { pinnedSigners: [created.invoice.signer], ...(mode === 'passphrase' ? { passphrase: PASSPHRASE } : {}) };
    let signature: string | undefined;
    for (const fragment of [fromUrl, fromQr, fromFile]) {
      const parsed = await parseFragment(fragment, options);
      expect(parsed.invoice).toEqual(created.invoice);
      expect(invoiceDigest(parsed.invoice)).toEqual(invoiceDigest(created.invoice));
      expect(parsed.verification).toEqual({ signatureValid: true, signerPinned: true });
      if (signature === undefined) signature = parsed.signature;
      else expect(parsed.signature).toBe(signature);
    }
    expect(JSON.parse(file)).toEqual({ format: 'ghostpay-payment-request', version: 1, fragment: created.fragment });
    expect(file).not.toContain(BASE_URL);
    expect(file).not.toContain(PASSPHRASE);
  });
});
