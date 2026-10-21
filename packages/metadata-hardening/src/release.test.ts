import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_BUCKETS, RelayerPinning, padBody, planRelease, stripPad, validateRelayerUrls } from './release.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const opts = { chainId: 31337, nowMs: 1_000_000, windowSec: 60 };
const far = 1_000_000 / 1000 + 3600;

describe('MH-REL-2 planRelease', () => {
  it('releases inside the window, before the deadline, ranks are a permutation', () => {
    const sweeps = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, deadlineSec: far }));
    const plan = planRelease(sweeps, opts, seededRng(3));
    expect(plan).toHaveLength(5);
    for (const d of plan) {
      expect(d.status).toBe('scheduled');
      if (d.status === 'scheduled') {
        expect(d.releaseAtMs).toBeGreaterThanOrEqual(opts.nowMs);
        expect(d.releaseAtMs).toBeLessThanOrEqual(opts.nowMs + 60_000);
        expect(d.releaseAtMs).toBeLessThan(far * 1000);
      }
    }
    const ranks = plan.map((d) => (d.status === 'scheduled' ? d.rank : -1)).sort();
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
  });
  it('rejects sweeps whose remaining deadline is not longer than the window', () => {
    const plan = planRelease(
      [
        { id: 'tight', deadlineSec: opts.nowMs / 1000 + 60 },
        { id: 'past', deadlineSec: opts.nowMs / 1000 - 5 },
        { id: 'ok', deadlineSec: far },
      ],
      opts,
    );
    expect(plan.filter((d) => d.status === 'rejected').map((d) => d.id).sort()).toEqual(['past', 'tight']);
    expect(plan.find((d) => d.id === 'ok')?.status).toBe('scheduled');
  });
  it('order is an unbiased permutation (chi-square, N=1000, 3 sweeps, 6 perms)', () => {
    const counts = new Map<string, number>();
    const rng = seededRng(2024);
    const sweeps = ['a', 'b', 'c'].map((id) => ({ id, deadlineSec: far }));
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const order = planRelease(sweeps, opts, rng)
        .filter((d) => d.status === 'scheduled')
        .sort((x, y) => (x.status === 'scheduled' && y.status === 'scheduled' ? x.rank - y.rank : 0))
        .map((d) => d.id)
        .join('');
      counts.set(order, (counts.get(order) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    const exp = N / 6;
    let chi = 0;
    for (const c of counts.values()) chi += (c - exp) ** 2 / exp;
    expect(chi).toBeLessThan(20.5); // df=5, p=0.001
  });
  it('arrival order differs from release order in a majority of runs (5 sweeps)', () => {
    const rng = seededRng(5);
    const ids = ['1', '2', '3', '4', '5'];
    let differ = 0;
    for (let i = 0; i < 200; i++) {
      const order = planRelease(ids.map((id) => ({ id, deadlineSec: far })), opts, rng)
        .map((d) => (d.status === 'scheduled' ? { id: d.id, r: d.rank } : { id: d.id, r: 99 }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.id);
      if (order.join('') !== ids.join('')) differ++;
    }
    expect(differ).toBeGreaterThan(150);
  });
  it('validates', () => {
    const s = [{ id: 'a', deadlineSec: far }];
    expect(() => planRelease(s, { ...opts, windowSec: 0 })).toThrow(MetadataHardeningError);
    expect(() => planRelease(s, { ...opts, windowSec: 3601 })).toThrow(MetadataHardeningError);
    expect(() => planRelease(s, { ...opts, nowMs: NaN })).toThrow(MetadataHardeningError);
    expect(() => planRelease(s, { ...opts, chainId: 1 })).toThrow(MetadataHardeningError);
    expect(() => planRelease([...s, ...s], opts)).toThrow(MetadataHardeningError);
    expect(() => planRelease([{ id: 'x', deadlineSec: NaN }], opts)).toThrow(MetadataHardeningError);
    expect(planRelease([], opts)).toEqual([]);
  });
});

describe('MH-REL-3 padding', () => {
  const enc = new TextEncoder();
  it('every body lands exactly on a bucket and round-trips', () => {
    const rng = seededRng(11);
    for (const n of [0, 1, 50, 500, 1000, 1500, 3000, 4000]) {
      const body = { owner: '0x' + 'ab'.repeat(20), memo: 'x'.repeat(n) };
      if (n > 4000 - 100) continue;
      const s = padBody(body, DEFAULT_BODY_BUCKETS, rng);
      expect(DEFAULT_BODY_BUCKETS).toContain(enc.encode(s).length);
      expect(stripPad(JSON.parse(s) as Record<string, unknown>)).toEqual(body);
    }
  });
  it('empty body and exact-fit', () => {
    const s = padBody({}, [64]);
    expect(enc.encode(s).length).toBe(64);
    expect(JSON.parse(s)).toHaveProperty('pad');
    const body = { a: 'x'.repeat(30) }; // {"a":"xxx..."} = 40 bytes; + 9 = 49 -> pad 0 at bucket 49
    const exact = padBody(body, [49]);
    expect(enc.encode(exact).length).toBe(49);
  });
  it('uses UTF-8 byte length', () => {
    const s = padBody({ m: 'é'.repeat(10) }, [128]);
    expect(enc.encode(s).length).toBe(128);
  });
  it('rejects oversize, existing pad, bad buckets', () => {
    expect(() => padBody({ m: 'x'.repeat(5000) })).toThrow(MetadataHardeningError);
    expect(() => padBody({ pad: '00' })).toThrow(MetadataHardeningError);
    expect(() => padBody({}, [])).toThrow(MetadataHardeningError);
    expect(() => padBody({}, [20_000])).toThrow(MetadataHardeningError);
  });
  it('stripPad accepts only bounded hex', () => {
    expect(stripPad({ a: 1 })).toEqual({ a: 1 });
    expect(stripPad({ a: 1, pad: 'ab01' })).toEqual({ a: 1 });
    expect(() => stripPad({ pad: 'XYZ' })).toThrow(MetadataHardeningError);
    expect(() => stripPad({ pad: 5 })).toThrow(MetadataHardeningError);
    expect(() => stripPad({ pad: 'a'.repeat(16385) })).toThrow(MetadataHardeningError);
  });
});

describe('MH-REL-4 relayer selection', () => {
  const urls = ['https://r1.example', 'https://r2.example', 'http://127.0.0.1:8787'];
  it('validates URL lists', () => {
    expect(validateRelayerUrls(urls)).toHaveLength(3);
    expect(() => validateRelayerUrls([])).toThrow(MetadataHardeningError);
    expect(() => validateRelayerUrls(['http://r1.example'])).toThrow(MetadataHardeningError);
    expect(() => validateRelayerUrls(['https://u:p@r1.example'])).toThrow(MetadataHardeningError);
    expect(() => validateRelayerUrls(['https://r1.example', 'https://r1.example/'])).toThrow(MetadataHardeningError);
    expect(() => validateRelayerUrls(['nonsense'])).toThrowError(/valid URL/);
    expect(() => validateRelayerUrls(Array.from({ length: 9 }, (_, i) => `https://r${i}.example`))).toThrow(MetadataHardeningError);
  });
  it('error messages never echo the URL', () => {
    try {
      validateRelayerUrls(['https://user:secret@r1.example']);
    } catch (e) {
      expect((e as Error).message).not.toMatch(/secret|r1\.example/);
    }
  });
  it('quote and sweep share a relayer; 20 sweeps spread over two relayers', () => {
    const p = new RelayerPinning(urls.slice(0, 2), seededRng(8));
    const counts = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      const id = `s${i}`;
      const q = p.assign(id);
      expect(p.assign(id)).toBe(q);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    expect(counts.size).toBe(2);
    for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(4);
  });
  it('failover needs confirmation and picks a different relayer', () => {
    const p = new RelayerPinning(urls, seededRng(9));
    const first = p.assign('x');
    expect(() => p.failover('x', false)).toThrow(MetadataHardeningError);
    expect(p.assign('x')).toBe(first);
    const second = p.failover('x', true);
    expect(second).not.toBe(first);
    expect(p.assign('x')).toBe(second);
    p.release('x');
    expect(() => p.assign('')).toThrow(MetadataHardeningError);
  });
  it('failover with one relayer conflicts', () => {
    const p = new RelayerPinning(['https://r1.example']);
    expect(() => p.failover('x', true)).toThrow(MetadataHardeningError);
  });
});
