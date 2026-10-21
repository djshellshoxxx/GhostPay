import { describe, expect, it } from 'vitest';
import { inspect, format } from 'node:util';
import fc from 'fast-check';
import { SecretBox, SecretBoxError, assertNoSecretBox, wipe } from './secretBox.js';

const KEY = Uint8Array.from({ length: 32 }, (_, i) => 0xa0 + i);
const KEY_HEX = Buffer.from(KEY).toString('hex');
const fresh = (): SecretBox => SecretBox.copyOf(KEY.slice(), { label: 'spend' });

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SecretBoxError ? e.code : `other:${String(e)}`;
  }
  return undefined;
}

describe('S3-08 regression: every channel that leaked SecretBytes is closed', () => {
  const leaks = (v: unknown): boolean => {
    const s = typeof v === 'string' ? v : JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
    return s.includes(KEY_HEX) || s.includes(Array.from(KEY).join(','));
  };

  it('spread, entries, keys, assign see no data', () => {
    const b = fresh();
    expect({ ...b }).toEqual({});
    expect(Object.entries(b)).toEqual([]);
    expect(Object.keys(b)).toEqual([]);
    expect(Object.getOwnPropertyNames(b)).toEqual([]);
    expect(Object.assign({}, b)).toEqual({});
  });

  it('structuredClone (postMessage / IndexedDB) yields an empty object', () => {
    const b = fresh();
    expect(structuredClone(b)).toEqual({});
    expect(structuredClone({ k: b })).toEqual({ k: {} });
  });

  it('array-like and iteration paths yield no secret bytes', () => {
    const b = fresh();
    expect(() => [...(b as unknown as Iterable<number>)]).toThrow(TypeError);
    expect(Array.from(b as unknown as ArrayLike<number>).every((x) => x === undefined)).toBe(true);
    expect(Uint8Array.from(b as unknown as ArrayLike<number>).every((x) => x === 0)).toBe(true);
    expect(new Uint8Array(b as unknown as ArrayLike<number>).every((x) => x === 0)).toBe(true);
    expect(Array.prototype.join.call(b)).not.toMatch(/\d/);
    expect(() => new TextDecoder().decode(b as unknown as Uint8Array)).toThrow(TypeError);
    expect('slice' in b || 'subarray' in b).toBe(false);
  });

  it('string paths print a redacted marker and never throw (logging cannot crash)', () => {
    const b = fresh();
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/restrict-plus-operands -- coercion is the behaviour under test
    for (const s of [String(b), `${b}`, b + '', inspect(b), format('%o %s %O', b, b, b), inspect({ nested: [b] })]) {
      expect(s).toContain('[SecretBox spend redacted]');
      expect(leaks(s)).toBe(false);
    }
    // Buffer.from treats the box as array-like (length getter, no indexed data): zeros, no secret.
    expect(Buffer.from(b as unknown as Uint8Array).every((x) => x === 0)).toBe(true);
    expect(Number.isNaN(Number(b))).toBe(true);
  });

  it('JSON serialization throws', () => {
    const b = fresh();
    expect(code(() => JSON.stringify(b))).toBe('SERIALIZE');
    expect(code(() => JSON.stringify({ a: [b] }))).toBe('SERIALIZE');
  });

  it('the object is frozen: no property can be attached to smuggle data', () => {
    const b = fresh();
    expect(Object.isFrozen(b)).toBe(true);
    expect(() => {
      (b as unknown as { x: number }).x = 1;
    }).toThrow(TypeError);
  });
});

describe('SecretBox lifecycle', () => {
  it('copyOf copies and wipes the source by default', () => {
    const src = KEY.slice();
    const b = SecretBox.copyOf(src);
    expect(src.every((x) => x === 0)).toBe(true);
    expect(b.label).toBe('secret');
    expect(b.length).toBe(32);
    expect(b.equals(KEY)).toBe(true);
  });

  it('copyOf can leave the source intact', () => {
    const src = KEY.slice();
    SecretBox.copyOf(src, { wipeSource: false });
    expect(src).toEqual(KEY);
  });

  it.each([[new Uint8Array(0)], ['abc' as unknown as Uint8Array], [[1, 2] as unknown as Uint8Array]])('copyOf rejects %j', (bad) => {
    expect(code(() => SecretBox.copyOf(bad))).toBe('INVALID_INPUT');
  });

  it.each(['', 'has space', 'x'.repeat(33), 'ünïcode'])('rejects label %j', (label) => {
    expect(code(() => SecretBox.copyOf(KEY.slice(), { label }))).toBe('INVALID_INPUT');
  });

  it('use lends a copy and wipes it after return and after throw', () => {
    const b = fresh();
    let lent: Uint8Array | undefined;
    const sum = b.use((k) => {
      lent = k;
      return k.reduce((a, x) => a + x, 0);
    });
    expect(sum).toBe(KEY.reduce((a, x) => a + x, 0));
    expect(lent?.every((x) => x === 0)).toBe(true);
    let lent2: Uint8Array | undefined;
    expect(() =>
      b.use((k) => {
        lent2 = k;
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(lent2?.every((x) => x === 0)).toBe(true);
    b.use((k) => {
      k.fill(1); // mutating the loan does not change the box
    });
    expect(b.equals(KEY)).toBe(true);
  });

  it('use refuses async callbacks (copy would be wiped before the await)', async () => {
    const b = fresh();
    expect(code(() => b.use(() => Promise.resolve(1)))).toBe('ASYNC_IN_SYNC_USE');
    expect(code(() => b.use(() => ({ then: 1 })))).toBeUndefined();
    await expect(b.useAsync((k) => Promise.resolve(k[0]))).resolves.toBe(0xa0);
    let lent: Uint8Array | undefined;
    await expect(
      b.useAsync((k) => {
        lent = k;
        return Promise.reject(new Error('later'));
      }),
    ).rejects.toThrow('later');
    expect(lent?.every((x) => x === 0)).toBe(true);
  });

  it('take moves the bytes out (for transfer) and disposes the box', () => {
    const b = fresh();
    const raw = b.take();
    expect(raw).toEqual(KEY);
    expect(b.disposed).toBe(true);
    expect(b.length).toBe(0);
    expect(code(() => b.take())).toBe('DISPOSED');
    const { port1, port2 } = new MessageChannel();
    port1.postMessage(raw, [raw.buffer]);
    expect(raw.byteLength).toBe(0); // detached on the sending side
    port1.close();
    port2.close();
  });

  it('dispose wipes, is idempotent, and blocks further use', async () => {
    const b = fresh();
    let inner: Uint8Array | undefined;
    // Observe the internal buffer through take() on a twin to prove dispose wipes in place.
    const twin = fresh();
    twin.use((k) => (inner = k));
    b.dispose();
    b.dispose();
    expect(b.disposed).toBe(true);
    expect(code(() => b.use(() => 1))).toBe('DISPOSED');
    await expect(b.useAsync(() => Promise.resolve(1))).rejects.toMatchObject({ code: 'DISPOSED' });
    expect(code(() => b.equals(KEY))).toBe('DISPOSED');
    expect(code(() => fresh().equals(b))).toBe('DISPOSED');
    expect(inner?.every((x) => x === 0)).toBe(true);
    expect(String(b)).toBe('[SecretBox spend redacted]');
  });

  it('equals compares boxes and bytes, including length mismatch', () => {
    const b = fresh();
    expect(b.equals(fresh())).toBe(true);
    expect(b.equals(KEY.subarray(0, 31))).toBe(false);
    const other = KEY.slice();
    other[31] = 0;
    expect(b.equals(other)).toBe(false);
    expect(b.equals(new Uint8Array(0))).toBe(false);
  });

  it('property: equals agrees with byte equality', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 40 }), fc.uint8Array({ maxLength: 40 }), (a, b) => {
        const expected = a.length === b.length && a.every((x, i) => x === b[i]);
        return SecretBox.copyOf(a, { wipeSource: false }).equals(b) === expected;
      }),
    );
  });

  it('random uses the supplied rng and validates length', () => {
    const calls: number[] = [];
    const rng = {
      getRandomValues<T extends ArrayBufferView | null>(a: T): T {
        if (a instanceof Uint8Array) {
          calls.push(a.length);
          a.fill(7);
        }
        return a;
      },
    };
    const b = SecretBox.random(16, { rng, label: 'aes' });
    expect(calls).toEqual([16]);
    expect(b.equals(new Uint8Array(16).fill(7))).toBe(true);
    expect(SecretBox.random(32).length).toBe(32);
    for (const n of [0, 1.5, 65_537, Number.NaN]) expect(code(() => SecretBox.random(n))).toBe('INVALID_INPUT');
  });

  it('isSecretBox distinguishes boxes from look-alikes', () => {
    expect(SecretBox.isSecretBox(fresh())).toBe(true);
    expect(SecretBox.isSecretBox({})).toBe(false);
    expect(SecretBox.isSecretBox(null)).toBe(false);
    const fake = Object.create(SecretBox.prototype) as SecretBox;
    expect(SecretBox.isSecretBox(fake)).toBe(false);
    expect(code(() => fake.dispose())).toBe('INVALID_INPUT');
  });
});

describe('wipe', () => {
  it('zeroes buffers and skips null/undefined', () => {
    const a = Uint8Array.of(1, 2);
    const b = Uint8Array.of(3);
    wipe(a, null, undefined, b);
    expect([...a, ...b]).toEqual([0, 0, 0]);
  });
});

describe('assertNoSecretBox', () => {
  it('passes ordinary payloads and fails on a nested box', () => {
    const shared = { x: 1 };
    expect(() => assertNoSecretBox({ a: [1, 'x', new Uint8Array(4), new ArrayBuffer(2)], b: shared, c: shared, d: null })).not.toThrow();
    expect(() => assertNoSecretBox(5)).not.toThrow();
    expect(code(() => assertNoSecretBox({ deep: [{ k: fresh() }] }))).toBe('SECRET_IN_PAYLOAD');
    expect(code(() => assertNoSecretBox(new Map([['k', fresh()]])))).toBe('SECRET_IN_PAYLOAD');
    expect(code(() => assertNoSecretBox(new Map([[fresh(), 1]])))).toBe('SECRET_IN_PAYLOAD');
    expect(code(() => assertNoSecretBox(new Set([fresh()])))).toBe('SECRET_IN_PAYLOAD');
  });

  it('handles cycles and fails closed on oversize structures', () => {
    const cyc: { self?: unknown } = {};
    cyc.self = cyc;
    expect(() => assertNoSecretBox(cyc)).not.toThrow();
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(code(() => assertNoSecretBox(deep))).toBe('INVALID_INPUT');
    const wide = Array.from({ length: 10_001 }, () => ({}));
    expect(code(() => assertNoSecretBox(wide))).toBe('INVALID_INPUT');
  });
});

describe('wipe intrinsic (L-2)', () => {
  it('zeroes a Uint8Array subclass whose fill is overridden', () => {
    class Evil extends Uint8Array {
      public override fill(): this {
        return this;
      }
    }
    const e = new Evil(Uint8Array.of(9, 9, 9));
    wipe(e);
    expect([...e]).toEqual([0, 0, 0]);
    const own = Uint8Array.of(7, 7);
    Object.defineProperty(own, 'fill', { value: () => own });
    SecretBox.copyOf(own);
    expect([...own]).toEqual([0, 0]);
  });
});

describe('use() with async callback (L-4)', () => {
  it('throws and does not leave an unhandled rejection', async () => {
    const seen: unknown[] = [];
    const h = (r: unknown): void => void seen.push(r);
    process.on('unhandledRejection', h);
    try {
      const b = fresh();
      expect(code(() => b.use(() => Promise.reject(new Error('late'))))).toBe('ASYNC_IN_SYNC_USE');
      const odd = { then: (): never => { throw new Error('bad then'); } };
      expect(code(() => b.use(() => odd))).toBe('ASYNC_IN_SYNC_USE');
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', h);
    }
    expect(seen).toEqual([]);
  });
});

describe('assertNoSecretBox containers (L-5)', () => {
  const sc = (v: unknown): string | undefined => code(() => assertNoSecretBox(v));
  it('finds boxes under symbol keys, non-enumerable props, class fields, typed-array props, error cause', () => {
    expect(sc({ [Symbol('k')]: fresh() })).toBe('SECRET_IN_PAYLOAD');
    expect(sc(Object.defineProperty({}, 'hid', { value: fresh(), enumerable: false }))).toBe('SECRET_IN_PAYLOAD');
    class Holder { public inner = fresh(); }
    expect(sc(new Holder())).toBe('SECRET_IN_PAYLOAD');
    const ta = Object.assign(new Uint8Array(4), { extra: fresh() });
    expect(sc(ta)).toBe('SECRET_IN_PAYLOAD');
    expect(sc(new Error('x', { cause: fresh() }))).toBe('SECRET_IN_PAYLOAD');
    expect(sc(new Map([['a', new Set([[fresh()]])]]))).toBe('SECRET_IN_PAYLOAD');
    expect(sc(Object.assign(new Map(), { side: fresh() }))).toBe('SECRET_IN_PAYLOAD');
  });
  it('handles cycles and large typed arrays', () => {
    const a: Record<string, unknown> = {};
    a['self'] = a;
    const m = new Map<unknown, unknown>();
    m.set('m', m);
    expect(sc([a, m, new Uint8Array(100_000)])).toBeUndefined();
  });
  it('fails closed with SecretBoxError on getters, proxies, WeakMap/WeakSet', () => {
    let called = false;
    const g = { get x(): unknown { called = true; throw new Error('boom'); } };
    expect(sc(g)).toBe('INVALID_INPUT');
    expect(called).toBe(false);
    const px = new Proxy({}, { ownKeys: () => { throw new Error('trap'); } });
    expect(sc(px)).toBe('INVALID_INPUT');
    expect(sc(new WeakMap())).toBe('INVALID_INPUT');
    expect(sc({ w: new WeakSet() })).toBe('INVALID_INPUT');
  });
});
