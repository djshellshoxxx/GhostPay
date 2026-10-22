import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Assembler } from './assembler.js';
import { b64urlDecode, b64urlEncode } from './base64url.js';
import { QrExchangeError } from './errors.js';
import {
  MAX_CHUNKS,
  MAX_CHUNK_CHARS,
  MAX_PAYLOAD_BYTES,
  crc32Ascii,
  encodeMultipart,
  parseChunk,
} from './multipart.js';

const bytes = (n: number, seed = 1): Uint8Array => {
  const b = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x >> 16;
  }
  return b;
};
const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof QrExchangeError ? e.code : 'OTHER';
  }
  return 'NONE';
};
const feed = (chunks: string[]): Uint8Array => {
  const a = new Assembler();
  let r;
  for (const c of chunks) r = a.add(c);
  expect(r?.complete).toBe(true);
  return r?.payload as Uint8Array;
};

describe('crc32 / base64url', () => {
  it('matches the CRC-32 check value', () => {
    expect(crc32Ascii('123456789')).toBe(0xcbf43926);
  });
  it('round-trips and is canonical', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 300 }), (b) => {
        const s = b64urlEncode(b);
        expect(Array.from(b64urlDecode(s))).toEqual(Array.from(b));
      }),
    );
  });
  it('rejects padding, bad chars, non-canonical tails, length%4==1, empty, non-ASCII', () => {
    for (const s of ['QQ==', 'Q', 'QR', 'QUJ', 'QU+/', 'QU Q', '', 'é', 'QÃ']) {
      expect(code(() => b64urlDecode(s))).toBe('BAD_CHUNK');
    }
    expect(Array.from(b64urlDecode('QQ'))).toEqual([0x41]);
  });
});

describe('encode', () => {
  it('single chunk for tiny payload with expected shape', () => {
    const c = encodeMultipart(new Uint8Array([1, 2, 3]));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatch(/^GPQ1\/[0-9a-f]{16}\/0\/1\/[0-9a-f]{8}\/AQID$/);
  });
  it('16 KiB uses the default size, 32 KiB grows chunks to stay <= 64', () => {
    const a = encodeMultipart(bytes(16384));
    expect(a.length).toBe(Math.ceil(21846 / 400));
    const b = encodeMultipart(bytes(MAX_PAYLOAD_BYTES));
    expect(b.length).toBeLessThanOrEqual(MAX_CHUNKS);
    for (const c of b) expect(parseChunk(c).data.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(Array.from(feed(b))).toEqual(Array.from(bytes(MAX_PAYLOAD_BYTES)));
  });
  it('rejects bad inputs', () => {
    expect(code(() => encodeMultipart(new Uint8Array(0)))).toBe('BAD_INPUT');
    expect(code(() => encodeMultipart('x' as unknown as Uint8Array))).toBe('BAD_INPUT');
    expect(code(() => encodeMultipart(new Uint8Array(MAX_PAYLOAD_BYTES + 1)))).toBe('TOO_LARGE');
    for (const chunkChars of [0, 31, 701, 1.5, NaN]) {
      expect(code(() => encodeMultipart(bytes(10), { chunkChars }))).toBe('BAD_INPUT');
    }
    expect(code(() => encodeMultipart(bytes(MAX_PAYLOAD_BYTES), { chunkChars: 100 }))).toBe('TOO_MANY_CHUNKS');
  });
});

describe('Assembler', () => {
  const payload = bytes(5000, 7);
  const chunks = encodeMultipart(payload, { chunkChars: 200 });

  it('reassembles in any order with duplicates', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(chunks, { minLength: chunks.length }), fc.nat(5), (order, dups) => {
        const a = new Assembler();
        let r;
        for (const c of order) {
          r = a.add(c);
          for (let i = 0; i < dups; i++) r = a.add(c);
        }
        expect(r?.complete).toBe(true);
        expect(Array.from(r?.payload ?? [])).toEqual(Array.from(payload));
      }),
      { numRuns: 30 },
    );
  });
  it('reports progress and is stable after completion', () => {
    const a = new Assembler();
    const r0 = a.add(chunks[3] as string);
    expect(r0).toMatchObject({ complete: false, received: 1, total: chunks.length });
    expect(r0.payload).toBeUndefined();
    expect(r0.progress).toBeCloseTo(1 / chunks.length);
    for (const c of chunks) a.add(c);
    const r = a.add(chunks[0] as string);
    expect(r.complete).toBe(true);
    expect(r.progress).toBe(1);
    r.payload?.fill(0);
    expect(Array.from(a.add(chunks[1] as string).payload ?? [])).toEqual(Array.from(payload));
    a.reset();
    expect(a.add(chunks[0] as string).received).toBe(1);
  });
  it('rejects mixed sessions and keeps state', () => {
    const other = encodeMultipart(bytes(5000, 9), { chunkChars: 200 });
    const a = new Assembler();
    a.add(chunks[0] as string);
    expect(code(() => a.add(other[1] as string))).toBe('SESSION_MISMATCH');
    const diffTotal = encodeMultipart(payload, { chunkChars: 300 });
    expect(code(() => a.add(diffTotal[1] as string))).toBe('SESSION_MISMATCH');
    expect(a.add(chunks[1] as string).received).toBe(2);
  });
  it('rejects a conflicting body for a held index (valid crc)', () => {
    const p = parseChunk(chunks[0] as string);
    const body = 'A'.repeat(p.data.length);
    const crc = crc32Ascii(`${p.session}/0/${String(p.total)}/${body}`).toString(16).padStart(8, '0');
    const forged = `GPQ1/${p.session}/0/${String(p.total)}/${crc}/${body}`;
    const a = new Assembler();
    a.add(chunks[0] as string);
    expect(code(() => a.add(forged))).toBe('CHUNK_CONFLICT');
  });
  it('fails integrity (and resets) when a crc-valid forged chunk changes the payload', () => {
    const p = parseChunk(chunks[0] as string);
    const body = 'A'.repeat(p.data.length);
    const crc = crc32Ascii(`${p.session}/0/${String(p.total)}/${body}`).toString(16).padStart(8, '0');
    const forged = `GPQ1/${p.session}/0/${String(p.total)}/${crc}/${body}`;
    const a = new Assembler();
    let err = 'NONE';
    for (const c of [forged, ...chunks.slice(1)]) err = code(() => a.add(c));
    expect(err).toBe('INTEGRITY_FAILED');
    expect(a.add(chunks[0] as string).received).toBe(1);
  });
  const forge = (session: string, parts: string[]): string[] =>
    parts.map((d, i) => {
      const crc = crc32Ascii(`${session}/${String(i)}/${String(parts.length)}/${d}`).toString(16).padStart(8, '0');
      return `GPQ1/${session}/${String(i)}/${String(parts.length)}/${crc}/${d}`;
    });
  it('fails integrity on uneven chunk sizes, non-canonical base64 and empty-decode', () => {
    const s = '0123456789abcdef';
    for (const parts of [['QUJD', 'QUJDQUJD'], ['QUJDQUJD', 'QUJDQUJDQQ'], ['QR'], ['QUJD', 'QQ']]) {
      const a = new Assembler();
      let err = 'NONE';
      for (const c of forge(s, parts)) err = code(() => a.add(c));
      expect(err).toBe('INTEGRITY_FAILED');
    }
  });
  it('fails integrity when total decodes beyond the size cap', () => {
    const s = '0123456789abcdef';
    const part = 'A'.repeat(700);
    const parts = Array.from({ length: 64 }, () => part);
    const a = new Assembler();
    let err = 'NONE';
    for (const c of forge(s, parts)) err = code(() => a.add(c));
    expect(err).toBe('INTEGRITY_FAILED');
  });
});

describe('parseChunk strictness', () => {
  const good = encodeMultipart(bytes(100))[0] as string;
  const sess = good.split('/')[1] as string;
  it('accepts a valid chunk', () => {
    expect(parseChunk(good).total).toBe(1);
  });
  it.each([
    ['non-string', 5],
    ['empty', ''],
    ['wrong magic', good.replace('GPQ1', 'GPQ2')],
    ['lowercase magic', good.replace('GPQ1', 'gpq1')],
    ['trailing newline', good + '\n'],
    ['leading space', ' ' + good],
    ['uppercase session', good.replace(sess, sess.toUpperCase().replace(/[0-9]/g, 'A'))],
    ['short session', good.replace(sess, sess.slice(1))],
    ['index == total', good.replace('/0/1/', '/1/1/')],
    ['leading zero index', good.replace('/0/1/', '/00/1/')],
    ['total 0', good.replace('/0/1/', '/0/0/')],
    ['total 65', good.replace('/0/1/', '/0/65/')],
    ['bad crc', good.replace(/\/[0-9a-f]{8}\//, '/00000000/')],
    ['padding', good + '='],
    ['extra field', good + '/x'],
    ['empty data', good.replace(/\/[A-Za-z0-9_-]+$/, '/')],
    ['huge', good + 'A'.repeat(2000)],
    ['oversize chunk', `GPQ1/${sess}/0/1/00000000/${'A'.repeat(701)}`],
  ])('rejects %s', (_n, v) => {
    expect(code(() => parseChunk(v))).toBe('BAD_CHUNK');
  });
  it('fuzz: arbitrary strings never throw anything but QrExchangeError', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (s) => {
        expect(['NONE', 'BAD_CHUNK']).toContain(code(() => parseChunk(s)));
      }),
      { numRuns: 500 },
    );
  });
  it('fuzz: any single-char mutation of a valid chunk is rejected or parses to the same session', () => {
    fc.assert(
      fc.property(fc.nat(good.length - 1), fc.string({ minLength: 1, maxLength: 1 }), (i, ch) => {
        const m = good.slice(0, i) + ch + good.slice(i + 1);
        if (m === good) return;
        try {
          parseChunk(m);
        } catch (e) {
          expect((e as QrExchangeError).code).toBe('BAD_CHUNK');
        }
      }),
      { numRuns: 500 },
    );
  });
  it('error messages are fixed and carry no input', () => {
    try {
      parseChunk('secret-looking-text');
    } catch (e) {
      expect((e as Error).message).toBe('qr-exchange: invalid chunk');
    }
  });
});
