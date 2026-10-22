import { describe, expect, it } from 'vitest';
import { SecretBoxError } from './secretBox.js';
import { SecretScope, withScope, withScopeAsync } from './scope.js';

const zero = (b: Uint8Array): boolean => b.every((x) => x === 0);

describe('withScope', () => {
  it('wipes tracked buffers and disposes boxes on success', () => {
    let buf: Uint8Array | undefined;
    let kept = false;
    const result = withScope((s) => {
      buf = s.track(Uint8Array.of(1, 2, 3));
      const box = s.box(Uint8Array.of(9, 9), 'tmp');
      const long = s.keep(s.box(Uint8Array.of(4), 'long'));
      kept = !long.disposed;
      return { box, long };
    });
    expect(zero(buf ?? Uint8Array.of(1))).toBe(true);
    expect(result.box.disposed).toBe(true);
    expect(kept).toBe(true);
    expect(result.long.disposed).toBe(false);
    expect(result.long.equals(Uint8Array.of(4))).toBe(true);
  });

  it('wipes on the error path (haiku L8: throw before the try)', () => {
    let buf: Uint8Array | undefined;
    const createWorker = (): never => {
      throw new Error('worker failed');
    };
    expect(() =>
      withScope((s) => {
        buf = s.track(Uint8Array.of(5, 5));
        createWorker();
      }),
    ).toThrow('worker failed');
    expect(zero(buf ?? Uint8Array.of(1))).toBe(true);
  });

  it('rejects async callbacks and still closes', () => {
    let buf: Uint8Array | undefined;
    let err: unknown;
    try {
      void withScope((s) => {
        buf = s.track(Uint8Array.of(1));
        return Promise.resolve(1);
      });
    } catch (e) {
      err = e;
    }
    expect((err as SecretBoxError).code).toBe('ASYNC_IN_SYNC_USE');
    expect(zero(buf ?? Uint8Array.of(1))).toBe(true);
    expect(withScope(() => null)).toBeNull();
  });
});

describe('withScopeAsync', () => {
  it('closes after the promise settles, on success and failure', async () => {
    let buf: Uint8Array | undefined;
    await expect(
      withScopeAsync(async (s) => {
        buf = s.track(Uint8Array.of(7));
        await Promise.resolve();
        expect(buf[0]).toBe(7); // still live while awaiting
        return 1;
      }),
    ).resolves.toBe(1);
    expect(zero(buf ?? Uint8Array.of(1))).toBe(true);
    let buf2: Uint8Array | undefined;
    await expect(
      withScopeAsync((s) => {
        buf2 = s.track(Uint8Array.of(8));
        return Promise.reject(new Error('rpc'));
      }),
    ).rejects.toThrow('rpc');
    expect(zero(buf2 ?? Uint8Array.of(1))).toBe(true);
  });
});

describe('SecretScope after close', () => {
  it('wipes late registrations and refuses them', () => {
    const s = new SecretScope();
    s.close();
    s.close();
    const late = Uint8Array.of(3);
    expect(() => s.track(late)).toThrow(SecretBoxError);
    expect(zero(late)).toBe(true);
    const lateBox = Uint8Array.of(4);
    expect(() => s.box(lateBox)).toThrow(SecretBoxError);
    expect(zero(lateBox)).toBe(true);
  });
});

describe('SecretScope.close robustness (L-1)', () => {
  it('track rejects non-Uint8Array values', () => {
    const s = new SecretScope();
    expect(() => s.track({} as unknown as Uint8Array)).toThrow(SecretBoxError);
    s.close();
  });
  it('close wipes and disposes everything even if a bad entry is present, then reports', () => {
    const s = new SecretScope();
    const a = s.track(Uint8Array.of(1, 2));
    const box = s.box(Uint8Array.of(5, 5));
    const c = s.track(Uint8Array.of(3, 4));
    (s as unknown as { buffers: unknown[] }).buffers.splice(1, 0, {});
    let err: unknown;
    try { s.close(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(SecretBoxError);
    expect((err as SecretBoxError).code).toBe('INVALID_INPUT');
    expect(zero(a) && zero(c)).toBe(true);
    expect(box.disposed).toBe(true);
    expect(() => s.close()).not.toThrow();
  });
  it('withScope does not mask the original error', () => {
    expect(() => withScope((s) => { (s as unknown as { buffers: unknown[] }).buffers.push({}); throw new RangeError('orig'); })).toThrow(RangeError);
  });
});
