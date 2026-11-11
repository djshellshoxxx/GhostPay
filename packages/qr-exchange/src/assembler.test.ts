import { describe, expect, it } from 'vitest';
import { Assembler, DEFAULT_ASSEMBLY_MAX_AGE_MS, QrExchangeError, encodeMultipart } from './index.js';

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
