import { describe, expect, it } from 'vitest';
import { EMBED_MAX_MESSAGE_BYTES, newNonce, parseEmbedMessage } from './embedProtocol';

const N = 'a'.repeat(32);
const TX = `0x${'b'.repeat(64)}`;
const env = (t: string, data: unknown, extra: Record<string, unknown> = {}): unknown => ({ t, n: N, v: 1, data, ...extra });

describe('parseEmbedMessage', () => {
  it('accepts every valid message type', () => {
    expect(parseEmbedMessage(env('gp:hello', {}))).toEqual(env('gp:hello', {}));
    expect(parseEmbedMessage(env('gp:init', {}))).toEqual(env('gp:init', {}));
    expect(parseEmbedMessage(env('gp:status', { phase: 'ready' }))).toEqual(env('gp:status', { phase: 'ready' }));
    expect(parseEmbedMessage(env('gp:done', { status: 'submitted', chainId: 8453, txHash: TX }))).toEqual(env('gp:done', { status: 'submitted', chainId: 8453, txHash: TX }));
    expect(parseEmbedMessage(env('gp:done', { status: 'cancelled', chainId: 1 }))).toEqual(env('gp:done', { status: 'cancelled', chainId: 1 }));
  });

  it.each([
    ['unknown type', env('gp:evil', {})],
    ['wrong version', { t: 'gp:init', n: N, v: 2, data: {} }],
    ['short nonce', { t: 'gp:init', n: 'abcd', v: 1, data: {} }],
    ['uppercase nonce', { t: 'gp:init', n: 'A'.repeat(32), v: 1, data: {} }],
    ['extra envelope key', env('gp:init', {}, { x: 1 })],
    ['missing data', { t: 'gp:init', n: N, v: 1 }],
    ['extra data key on init', env('gp:init', { a: 1 })],
    ['bad phase', env('gp:status', { phase: 'x' })],
    ['done with extra secret field', env('gp:done', { status: 'submitted', chainId: 1, txHash: TX, key: 'k' })],
    ['done with memo instead of hash', env('gp:done', { status: 'submitted', chainId: 1, memo: 'hi' })],
    ['submitted without hash', env('gp:done', { status: 'submitted', chainId: 1 })],
    ['cancelled with hash', env('gp:done', { status: 'cancelled', chainId: 1, txHash: TX })],
    ['bad hash', env('gp:done', { status: 'submitted', chainId: 1, txHash: '0x12' })],
    ['uppercase hash', env('gp:done', { status: 'submitted', chainId: 1, txHash: `0x${'B'.repeat(64)}` })],
    ['float chain', env('gp:done', { status: 'failed', chainId: 1.5 })],
    ['zero chain', env('gp:done', { status: 'failed', chainId: 0 })],
    ['string chain', env('gp:done', { status: 'failed', chainId: '1' })],
    ['null', null],
    ['string', 'gp:init'],
    ['array', [N]],
    ['number', 7],
    ['undefined', undefined],
    ['class instance', new (class X { t = 'gp:init'; n = N; v = 1; data = {}; })()],
    ['oversize', env('gp:status', { phase: 'ready', pad: 'x'.repeat(EMBED_MAX_MESSAGE_BYTES) })],
    ['array data', env('gp:init', [])],
  ])('rejects %s', (_n, raw) => {
    expect(parseEmbedMessage(raw)).toBeUndefined();
  });

  it('rejects hostile objects without throwing (getters, proxies, cycles, __proto__)', () => {
    const getter = { t: 'gp:init', n: N, v: 1, get data(): never { throw new Error('boom'); } };
    const cyc: Record<string, unknown> = { t: 'gp:init', n: N, v: 1, data: {} };
    cyc.self = cyc;
    const proxy = new Proxy({}, { ownKeys: () => { throw new Error('boom'); }, getPrototypeOf: () => { throw new Error('boom'); } });
    const proto = JSON.parse(`{"t":"gp:init","n":"${N}","v":1,"data":{},"__proto__":{"x":1}}`) as unknown;
    for (const x of [getter, cyc, proxy, proto]) expect(parseEmbedMessage(x)).toBeUndefined();
  });

  it('fuzz: random values never throw and only well-formed messages parse', () => {
    let s = 987654321;
    const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
    const atoms: unknown[] = [null, undefined, 0, 1, -1, 1.5, NaN, Infinity, '', 'gp:done', 'gp:hello', N, TX, 'submitted', 'x'.repeat(3000), true, [], {}, 8453, 2 ** 53];
    const gen = (d: number): unknown => {
      if (d > 3 || rnd() < 0.4) return pick(atoms);
      if (rnd() < 0.2) return [gen(d + 1), gen(d + 1)];
      const o: Record<string, unknown> = {};
      for (const k of ['t', 'n', 'v', 'data', 'status', 'chainId', 'txHash', 'phase', '__proto__', 'constructor']) if (rnd() < 0.5) Object.defineProperty(o, k, { value: gen(d + 1), enumerable: true, configurable: true, writable: true });
      return o;
    };
    let accepted = 0;
    for (let i = 0; i < 5000; i++) {
      const m = parseEmbedMessage(gen(0));
      if (m !== undefined) {
        accepted++;
        expect(m.n).toMatch(/^[0-9a-f]{32}$/);
        expect(JSON.stringify(m).length).toBeLessThanOrEqual(EMBED_MAX_MESSAGE_BYTES);
      }
    }
    expect(accepted).toBeLessThan(50);
  });

  it('newNonce yields 128-bit lowercase hex', () => {
    expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce(() => new Uint8Array(16))).toBe('0'.repeat(32));
  });
});
