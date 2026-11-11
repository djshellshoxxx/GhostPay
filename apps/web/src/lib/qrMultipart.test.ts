import { Assembler, parseChunk } from '@ghostpay/qr-exchange';
import { describe, expect, it } from 'vitest';
import { fitsSingleQr, multipartIfNeeded, toMultipart } from './qrMultipart';

const decode = (chunks: readonly string[]): string => {
  const a = new Assembler();
  let out: Uint8Array | undefined;
  for (const c of [...chunks].reverse()) out = a.add(c).payload ?? out;
  return new TextDecoder('utf-8', { fatal: true }).decode(out);
};

describe('multipart QR helpers', () => {
  it('reports whether text fits one locally generated QR', () => {
    expect(fitsSingleQr('https://app.test/#gpi=v1.abc')).toBe(true);
    expect(fitsSingleQr('x'.repeat(3000))).toBe(false);
  });

  it('round-trips UTF-8 text through GPQ1 chunks that each fit one QR', () => {
    const text = `ünïcødé ${'payload '.repeat(800)}`;
    const chunks = toMultipart(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(fitsSingleQr(c)).toBe(true);
      expect(parseChunk(c).total).toBe(chunks.length);
    }
    expect(decode(chunks)).toBe(text);
  });

  it('only splits when a single QR cannot hold the text, unless forced', () => {
    expect(multipartIfNeeded('short')).toBeUndefined();
    expect(multipartIfNeeded('x'.repeat(3000))?.length).toBeGreaterThan(1);
    const forced = multipartIfNeeded('y'.repeat(1004), { force: true });
    expect(forced?.length).toBeGreaterThan(1);
    expect(decode(forced ?? [])).toBe('y'.repeat(1004));
  });

  it('refuses empty and oversized input instead of producing a partial transfer', () => {
    expect(() => toMultipart('')).toThrow();
    expect(() => toMultipart('z'.repeat(33 * 1024))).toThrow();
  });
});
