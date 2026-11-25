import { encodeFragment } from '@ghostpay/invoice-schema';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { sampleSigned } from '../../invoice-schema/src/fixtures.testutil.js';
import { MAX_SCAN_TEXT_LEN } from './camera.js';
import { decodeQrImage, type DecodeImageEnv } from './readers.js';

const source = { size: 100, type: 'image/png' };

async function invoiceLink(seed: string) {
  return `https://app.test/${await encodeFragment(sampleSigned({}, seed))}`;
}

function detectorEnv(values: readonly string[]) {
  const close = vi.fn();
  const createImageBitmap = vi.fn(() => Promise.resolve({ width: 100, height: 100, close }));
  const env: DecodeImageEnv = {
    createImageBitmap,
    BarcodeDetector: class {
      detect() {
        return Promise.resolve(values.map((rawValue) => ({ rawValue })));
      }
    },
  };
  return { env, close, createImageBitmap };
}

describe('decodeQrImage platform multi-result selection', () => {
  it('returns the invoice link when the first native result has empty text', async () => {
    const link = await invoiceLink('second');
    const s = detectorEnv(['', link]);
    expect(await decodeQrImage(source, { env: s.env })).toBe(link);
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('reads a later valid QR when the first native result exceeds the scanner text bound', async () => {
    const s = detectorEnv(['x'.repeat(MAX_SCAN_TEXT_LEN + 1), 'valid-second-qr']);
    expect(await decodeQrImage(source, { env: s.env })).toBe('valid-second-qr');
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('returns the first invoice link when both native results are usable', async () => {
    const first = await invoiceLink('first');
    const second = await invoiceLink('second');
    expect(first).not.toBe(second);
    const s = detectorEnv([first, second]);
    expect(await decodeQrImage(source, { env: s.env })).toBe(first);
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('preserves a null result when all detected texts are unusable', async () => {
    const s = detectorEnv(['', 'y'.repeat(MAX_SCAN_TEXT_LEN + 1)]);
    expect(await decodeQrImage(source, { env: s.env })).toBeNull();
    expect(s.close).toHaveBeenCalledOnce();
  });

  it('selects the first usable text in generated native result lists and releases the bitmap', async () => {
    const atLimit = '🎫'.padEnd(MAX_SCAN_TEXT_LEN, 'x');
    const unusable = fc.constantFrom('', atLimit + 'x', atLimit + atLimit);
    const usable = fc.oneof(
      fc.string({ unit: 'binary', minLength: 1, maxLength: 64 }),
      fc.constantFrom(' ', '\0', 'e\u0301', 'x'.repeat(MAX_SCAN_TEXT_LEN - 1), atLimit,
        await invoiceLink('first'), await invoiceLink('second')),
    );
    const prefix = fc.array(unusable, { maxLength: 64, size: 'max' });
    const suffix = fc.array(fc.oneof(unusable, usable), { maxLength: 64, size: 'max' });

    await fc.assert(
      fc.asyncProperty(prefix, fc.option(usable), suffix, async (before, first, after) => {
        // A nonempty, all-unusable list returns null. An empty list takes the jsQR path.
        const values = first === null ? [...before, ''] : [...before, first, ...after];
        const s = detectorEnv(values);
        expect(await decodeQrImage(source, { env: s.env })).toBe(first);
        expect(s.close).toHaveBeenCalledOnce();
      }),
      { seed: Number(process.env.FUZZ_SEED ?? 508), numRuns: Number(process.env.FUZZ_RUNS ?? 512) },
    );
  });
});
