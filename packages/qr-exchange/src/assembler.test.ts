import { describe, expect, it } from 'vitest';
import { Assembler, DEFAULT_ASSEMBLY_MAX_AGE_MS, QrExchangeError, crc32Ascii, encodeMultipart, parseChunk } from './index.js';

const payload = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);

describe('Assembler missing-part reporting', () => {
  it('lists every part before the first chunk is unknown, then the exact missing indices', () => {
    const chunks = encodeMultipart(payload(900), { chunkChars: 200 });
    const a = new Assembler();
    expect(a.missing()).toEqual([]);
    expect(a.session).toBeNull();
    a.add(chunks[2]!);
    a.add(chunks[0]!);
    expect(a.session).toMatch(/^[0-9a-f]{16}$/);
    expect(a.missing()).toEqual(Array.from({ length: chunks.length }, (_, i) => i).filter((i) => i !== 0 && i !== 2));
    for (const c of chunks) a.add(c);
    expect(a.missing()).toEqual([]);
  });

  it('returns a copy, so callers cannot corrupt state', () => {
    const chunks = encodeMultipart(payload(900), { chunkChars: 200 });
    const a = new Assembler();
    a.add(chunks[0]!);
    const m = a.missing() as number[];
    m.length = 0;
    expect(a.missing().length).toBe(chunks.length - 1);
  });

  it('resets after an integrity failure so missing() is empty', () => {
    const a = new Assembler();
    a.add(encodeMultipart(payload(500), { chunkChars: 200 })[0]!);
    a.reset();
    expect(a.missing()).toEqual([]);
    expect(a.session).toBeNull();
  });
});

describe('Assembler idle expiry', () => {
  it('defaults to ten minutes', () => {
    expect(DEFAULT_ASSEMBLY_MAX_AGE_MS).toBe(10 * 60 * 1000);
  });

  it('refreshes the idle timer on activity and expires only after a full idle period', () => {
    let t = 1_000;
    const a = new Assembler({ now: () => t, maxAgeMs: 5_000 });
    const chunks = encodeMultipart(payload(900), { chunkChars: 200 });
    a.add(chunks[0]!);
    t += 4_000;
    a.add(chunks[1]!);
    t += 4_000; // 8 s since start, 4 s since last activity: still live
    expect(a.add(chunks[2]!).received).toBe(3);
    t += 5_001;
    expect(() => a.add(chunks[3]!)).toThrow(QrExchangeError);
  });

  it('reports SESSION_EXPIRED and leaves the assembler empty', () => {
    let t = 0;
    const a = new Assembler({ now: () => t, maxAgeMs: 100 });
    const chunks = encodeMultipart(payload(900), { chunkChars: 200 });
    a.add(chunks[0]!);
    t = 101;
    let code: string | undefined;
    try { a.add(chunks[1]!); } catch (e) { code = (e as QrExchangeError).code; }
    expect(code).toBe('SESSION_EXPIRED');
    expect(a.session).toBeNull();
    expect(a.missing()).toEqual([]);
    const r = a.add(chunks[1]!);
    expect(r.received).toBe(1);
  });

  it('keeps the original idle deadline after rejecting a CRC-valid conflicting chunk', () => {
    let t = 0;
    const a = new Assembler({ now: () => t, maxAgeMs: 100 });
    const expected = payload(500);
    const chunks = encodeMultipart(expected, { chunkChars: 400 });
    expect(chunks).toHaveLength(2);
    const first = parseChunk(chunks[0]);
    const body = `${first.data[0] === 'A' ? 'B' : 'A'}${first.data.slice(1)}`;
    const crc = crc32Ascii(`${first.session}/0/${String(first.total)}/${body}`).toString(16).padStart(8, '0');
    const conflicting = `GPQ1/${first.session}/0/${String(first.total)}/${crc}/${body}`;
    expect(parseChunk(conflicting).data).toBe(body);

    a.add(chunks[0]!);
    const session = a.session;
    const missing = a.missing();
    t = 90;
    expect(() => a.add(conflicting)).toThrowError(expect.objectContaining({ code: 'CHUNK_CONFLICT' }));
    expect(a.session).toBe(session);
    expect(a.missing()).toEqual(missing);

    t = 101;
    expect(() => a.add(chunks[1]!)).toThrowError(expect.objectContaining({ code: 'SESSION_EXPIRED' }));
    expect(a.session).toBeNull();
    expect(a.missing()).toEqual([]);
    expect(a.add(chunks[1]!).received).toBe(1);
    expect(a.add(chunks[0]!)).toMatchObject({ complete: true, payload: expected });
  });

  it.each([
    ['another session', 'SESSION_MISMATCH', () => encodeMultipart(payload(501), { chunkChars: 400 })[0]!],
    ['another total', 'SESSION_MISMATCH', () => encodeMultipart(payload(500), { chunkChars: 200 })[0]!],
    ['an invalid checksum', 'BAD_CHUNK', (chunks: string[]) => `${chunks[0]!}A`],
    ['malformed text', 'BAD_CHUNK', () => 'not a QR chunk'],
  ] as const)('does not refresh the idle deadline after rejecting %s', (_label, errorCode, rejectedChunk) => {
    let t = 0;
    const a = new Assembler({ now: () => t, maxAgeMs: 100 });
    const chunks = encodeMultipart(payload(500), { chunkChars: 400 });
    a.add(chunks[0]!);
    t = 90;
    expect(() => a.add(rejectedChunk(chunks))).toThrowError(expect.objectContaining({ code: errorCode }));
    t = 101;
    expect(() => a.add(chunks[1]!)).toThrowError(expect.objectContaining({ code: 'SESSION_EXPIRED' }));
    expect(a.session).toBeNull();
    expect(a.missing()).toEqual([]);
  });

  it('refreshes the idle deadline for an accepted duplicate and accepts the exact deadline', () => {
    let t = 0;
    const a = new Assembler({ now: () => t, maxAgeMs: 100 });
    const expected = payload(500);
    const chunks = encodeMultipart(expected, { chunkChars: 400 });
    a.add(chunks[0]!);
    t = 90;
    expect(a.add(chunks[0]!)).toMatchObject({ complete: false, received: 1, total: 2 });
    expect(a.missing()).toEqual([1]);
    t = 190;
    expect(a.add(chunks[1]!)).toMatchObject({ complete: true, payload: expected });
  });

  it('matches a model of idle expiry across seeded random chunk sequences', () => {
    // Synthetic fixture only. The model refreshes the deadline for accepted chunks alone: rejected conflicts and
    // malformed text must leave it unchanged, and an expired assembly must report SESSION_EXPIRED and restart empty.
    let seed = 0x5eed1234;
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let x = seed;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const chunks = encodeMultipart(payload(900), { chunkChars: 200 });
    expect(chunks.length).toBeGreaterThan(2);
    const conflicts = chunks.map((text) => {
      const c = parseChunk(text);
      const body = `${c.data[0] === 'A' ? 'B' : 'A'}${c.data.slice(1)}`;
      const crc = crc32Ascii(`${c.session}/${String(c.index)}/${String(c.total)}/${body}`).toString(16).padStart(8, '0');
      return `GPQ1/${c.session}/${String(c.index)}/${String(c.total)}/${crc}/${body}`;
    });
    const maxAgeMs = 100;
    for (let run = 0; run < 300; run++) {
      let t = 0;
      const a = new Assembler({ now: () => t, maxAgeMs });
      let held = new Set<number>();
      let last = 0;
      let active = false;
      let done = false;
      for (let step = 0; step < 40 && !done; step++) {
        const op = Math.floor(rand() * 4);
        if (op === 0) { t += Math.floor(rand() * 70); continue; }
        if (op === 1) {
          expect(() => a.add('not a QR chunk')).toThrowError(expect.objectContaining({ code: 'BAD_CHUNK' }));
          continue;
        }
        const i = Math.floor(rand() * chunks.length);
        const conflict = op === 3 && active && held.has(i);
        const text = conflict ? conflicts[i]! : chunks[i]!;
        if (active && t - last > maxAgeMs) {
          expect(() => a.add(text)).toThrowError(expect.objectContaining({ code: 'SESSION_EXPIRED' }));
          expect(a.session).toBeNull();
          active = false;
          held = new Set();
          continue;
        }
        if (conflict) {
          expect(() => a.add(text)).toThrowError(expect.objectContaining({ code: 'CHUNK_CONFLICT' }));
          continue;
        }
        const r = a.add(text);
        active = true;
        last = t;
        held.add(i);
        done = r.complete;
        expect(r.complete).toBe(held.size === chunks.length);
      }
    }
  });

  it('never expires a completed transfer and rejects invalid options', () => {
    let t = 0;
    const a = new Assembler({ now: () => t, maxAgeMs: 100 });
    const chunks = encodeMultipart(payload(300), { chunkChars: 400 });
    expect(a.add(chunks[0]!).complete).toBe(true);
    t = 10_000;
    expect(a.add(chunks[0]!).complete).toBe(true);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => new Assembler({ maxAgeMs: bad })).toThrow(QrExchangeError);
    }
  });
});
