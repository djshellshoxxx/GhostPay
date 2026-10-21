import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { B64, EVM, FRAG, HOST, LINK, POLICY } from './fixtures.testutil.js';
import { MAX_PAYLOAD_CHARS } from './payload.js';
import {
  addScan,
  ASSEMBLY_TTL_MS,
  interpretScan,
  nextPermissionState,
  permissionFromErrorName,
  permissionViewModel,
  type AssemblyState,
} from './qr.js';

const frame = (id: string, i: number, n: number, d: string) => `gpc1:${id}:${i}/${n}:${d}`;
const split = (s: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) =>
    s.slice(Math.floor((i * s.length) / n), Math.floor(((i + 1) * s.length) / n)),
  );

describe('interpretScan', () => {
  it('returns a payload for links, URIs, addresses', () => {
    expect(interpretScan(LINK, POLICY)).toMatchObject({ ok: true, value: { type: 'payload' } });
    expect(interpretScan(EVM, POLICY)).toMatchObject({ ok: true, value: { type: 'payload' } });
  });
  it('parses a chunk frame', () => {
    expect(interpretScan(frame('abc123', 2, 3, 'xyz'), POLICY)).toEqual({
      ok: true,
      value: { type: 'chunk', chunk: { id: 'abc123', index: 2, total: 3, data: 'xyz' } },
    });
  });
  it('rejects bad frames', () => {
    for (const s of [
      'gpc1:abc:1/2:x', // short id
      'gpc1:abc123:0/2:x',
      'gpc1:abc123:3/2:x', // index > total
      'gpc1:abc123:1/1:x', // total 1
      'gpc1:abc123:1/17:x',
      'gpc1:abc123:1/2:',
      'gpc1:ABC123:1/2:x',
      'gpc1:abc123:1/2:<script>',
    ])
      expect(interpretScan(s, POLICY)).toEqual({ ok: false, code: 'bad-chunk' });
    expect(interpretScan(frame('abc123', 1, 2, 'a'.repeat(2049)), POLICY)).toEqual({
      ok: false,
      code: 'chunk-too-large',
    });
  });
  it('enforces the per-scan size cap (default 4096) and passes errors through', () => {
    expect(interpretScan('a'.repeat(4097), POLICY)).toEqual({ ok: false, code: 'too-large' });
    expect(interpretScan(null, POLICY)).toEqual({ ok: false, code: 'not-string' });
    expect(interpretScan('hello', POLICY)).toEqual({ ok: false, code: 'unrecognized' });
  });
});

describe('addScan reassembly', () => {
  const big = `https://${HOST}/pay#gpi=v1.${'A'.repeat(5000)}`;
  const go = (state: AssemblyState | null, raw: string, now = 0) => {
    const r = addScan(state, raw, POLICY, now);
    if (!r.ok) throw new Error(r.code);
    return r.value;
  };

  it('reassembles 3 frames out of order and classifies the result', () => {
    const parts = split(big, 3);
    let v = go(null, frame('sess01', 3, 3, parts[2] as string), 10);
    expect(v).toMatchObject({ status: 'progress', received: 1, total: 3, missing: [1, 2], duplicate: false });
    v = go(v.status === 'progress' ? v.state : null, frame('sess01', 1, 3, parts[0] as string), 20);
    expect(v).toMatchObject({ status: 'progress', received: 2, missing: [2] });
    v = go(v.status === 'progress' ? v.state : null, frame('sess01', 2, 3, parts[1] as string), 30);
    expect(v.status).toBe('complete');
    if (v.status === 'complete') {
      expect(v.payload.kind).toBe('invoice-link');
      expect(v.payload.safeDisplay).toContain('[5000 chars hidden]');
    }
  });
  it('treats an identical repeat as duplicate and a different body as conflict', () => {
    const a = go(null, frame('sess01', 1, 2, 'aaaa'));
    const st = a.status === 'progress' ? a.state : null;
    expect(go(st, frame('sess01', 1, 2, 'aaaa'))).toMatchObject({
      status: 'progress',
      duplicate: true,
      received: 1,
    });
    expect(addScan(st, frame('sess01', 1, 2, 'bbbb'), POLICY, 0)).toEqual({
      ok: false,
      code: 'chunk-conflict',
    });
  });
  it('rejects another session id and a changed total', () => {
    const a = go(null, frame('sess01', 1, 2, 'aaaa'));
    const st = a.status === 'progress' ? a.state : null;
    expect(addScan(st, frame('other1', 2, 2, 'b'), POLICY, 1)).toEqual({
      ok: false,
      code: 'chunk-session-mismatch',
    });
    expect(addScan(st, frame('sess01', 2, 3, 'b'), POLICY, 1)).toEqual({ ok: false, code: 'chunk-conflict' });
  });
  it('expires after the TTL and restarts with the new frame', () => {
    const a = go(null, frame('sess01', 1, 2, 'aaaa'), 0);
    const st = a.status === 'progress' ? a.state : null;
    expect(addScan(st, frame('other1', 1, 2, 'cc'), POLICY, ASSEMBLY_TTL_MS)).toEqual({
      ok: false,
      code: 'chunk-session-mismatch',
    });
    expect(go(st, frame('other1', 1, 2, 'cc'), ASSEMBLY_TTL_MS + 1)).toMatchObject({
      status: 'progress',
      restarted: true,
      received: 1,
    });
  });
  it('passes through whole payload scans and scan errors', () => {
    expect(go(null, EVM)).toMatchObject({ status: 'payload' });
    expect(addScan(null, 'junk', POLICY, 0)).toEqual({ ok: false, code: 'unrecognized' });
  });
  it('rejects oversize totals, nested chunks, and bad joined payloads', () => {
    const chunk = (i: number, n: number, d: string) => frame('sess01', i, n, d);
    let st: AssemblyState | null = null;
    let last: ReturnType<typeof addScan> | null = null;
    for (let i = 1; i <= 16; i++) {
      last = addScan(st, chunk(i, 16, 'A'.repeat(2048)), { ...POLICY, maxChars: 4096 }, 0);
      if (!last.ok) break;
      st = last.value.status === 'progress' ? last.value.state : null;
    }
    expect(MAX_PAYLOAD_CHARS).toBeLessThan(16 * 2048);
    expect(last).toEqual({ ok: false, code: 'chunk-too-large' });

    const n1 = go(null, chunk(1, 2, 'gpc1:zzzzzz:1/2:a'));
    expect(addScan(n1.status === 'progress' ? n1.state : null, chunk(2, 2, 'b'), POLICY, 0)).toEqual({
      ok: false,
      code: 'nested-chunk',
    });

    const j1 = go(null, chunk(1, 2, 'hello'));
    expect(addScan(j1.status === 'progress' ? j1.state : null, chunk(2, 2, 'world'), POLICY, 0)).toEqual({
      ok: false,
      code: 'unrecognized',
    });
  });
  it('property: any split of a valid link into 2..16 frames, in any order, reassembles to the same payload', () => {
    const whole = `https://${HOST}/pay${FRAG}`;
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 16 }), fc.integer(), (n, seed) => {
        const parts = split(whole, n);
        const rot = Math.abs(seed) % n;
        const order = parts.map((_, i) => (i + rot) % n).reverse();
        let st: AssemblyState | null = null;
        let out = null;
        for (const i of order) {
          const d = parts[i] as string;
          const r = addScan(st, frame('prop01', i + 1, n, d), POLICY, 0);
          if (!r.ok) return false;
          if (r.value.status === 'complete') out = r.value.payload;
          else if (r.value.status === 'progress') st = r.value.state;
        }
        return out !== null && out.kind === 'invoice-link' && out.safeDisplay.includes(String(B64.length));
      }),
      { numRuns: 60 },
    );
  });
});

describe('permission view-model', () => {
  it('maps every state', () => {
    expect(permissionViewModel('granted')).toMatchObject({
      showScanner: true,
      primaryAction: 'start-scan',
      messageKey: 'intake.camera.granted',
      showPasteFallback: true,
    });
    expect(permissionViewModel('prompt')).toMatchObject({
      showScanner: false,
      primaryAction: 'request-permission',
    });
    expect(permissionViewModel('denied')).toMatchObject({
      showScanner: false,
      primaryAction: 'show-settings-help',
    });
    expect(permissionViewModel('unavailable')).toMatchObject({
      showScanner: false,
      primaryAction: 'use-fallback',
    });
  });
  it('maps error names', () => {
    expect(permissionFromErrorName('NotAllowedError')).toBe('denied');
    expect(permissionFromErrorName('SecurityError')).toBe('denied');
    expect(permissionFromErrorName('NotFoundError')).toBe('unavailable');
    expect(permissionFromErrorName('whatever')).toBe('unavailable');
  });
  it('transitions', () => {
    expect(nextPermissionState('prompt', { type: 'queried', state: 'granted' })).toBe('granted');
    expect(nextPermissionState('unavailable', { type: 'request-started' })).toBe('unavailable');
    expect(nextPermissionState('granted', { type: 'request-started' })).toBe('granted');
    expect(nextPermissionState('denied', { type: 'request-started' })).toBe('prompt');
    expect(nextPermissionState('prompt', { type: 'request-failed', errorName: 'NotAllowedError' })).toBe(
      'denied',
    );
    expect(nextPermissionState('prompt', { type: 'request-failed', errorName: 'NotFoundError' })).toBe(
      'unavailable',
    );
  });
});
