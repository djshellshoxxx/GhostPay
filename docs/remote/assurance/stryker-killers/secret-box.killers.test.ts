// Killer tests for surviving Stryker mutants in packages/secret-box. Drop into packages/secret-box/src/.
import { describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { SecretBox, SecretBoxError, assertNoSecretBox } from './secretBox.js';
import { SecretScope, withScope } from './scope.js';

const code = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (e) { return e instanceof SecretBoxError ? `${e.code}:${e.message}` : String(e); }
  return undefined;
};

describe('killers: secret-box', () => {
  it('dispose() zeroizes the internal buffer (secretBox.ts:219)', () => {
    let internal: Uint8Array | undefined;
    const rng = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { (a as Uint8Array).fill(0xaa); internal = a as unknown as Uint8Array; return a; } };
    const b = SecretBox.random(8, { rng });
    expect(internal!.every((x) => x === 0xaa)).toBe(true);
    b.dispose();
    expect(internal!.every((x) => x === 0)).toBe(true);
  });

  it('useAsync hands out a copy; the box survives callback mutation (secretBox.ts:179)', async () => {
    const b = SecretBox.copyOf(Uint8Array.of(1, 2, 3, 4), { label: 'k' });
    await b.useAsync(async (bytes) => { bytes.fill(9); });
    expect(b.disposed).toBe(false);
    expect(b.equals(Uint8Array.of(1, 2, 3, 4))).toBe(true);
  });

  it('random(1) and random(65536) are accepted; 0 and 65537 rejected (secretBox.ts:115)', () => {
    expect(SecretBox.random(1).length).toBe(1);
    expect(SecretBox.random(65_536).length).toBe(65_536);
    expect(code(() => SecretBox.random(0))).toMatch(/^INVALID_INPUT/);
    expect(code(() => SecretBox.random(65_537))).toMatch(/^INVALID_INPUT/);
  });

  it('scope.box() on a closed scope disposes the fresh copy (scope.ts:42)', () => {
    const spy = vi.spyOn(SecretBox, 'copyOf');
    const s = new SecretScope();
    s.close();
    expect(code(() => s.box(Uint8Array.of(1, 2, 3)))).toMatch(/^DISPOSED/);
    const made = spy.mock.results[0]!.value as SecretBox;
    expect(made.disposed).toBe(true);
    spy.mockRestore();
  });

  it('scope.box() forwards the label, and defaults when absent (scope.ts:40)', () => {
    withScope((s) => {
      expect(inspect(s.box(Uint8Array.of(1), 'mylabel'))).toContain('mylabel');
      expect(inspect(s.box(Uint8Array.of(1)))).not.toContain('mylabel');
    });
  });

  it('error codes carry their messages (message-string mutants)', () => {
    const s = new SecretScope(); s.close();
    expect(code(() => s.box(Uint8Array.of(1)))).toBe('DISPOSED:scope is closed');
    expect(code(() => s.track(Uint8Array.of(1)))).toBe('DISPOSED:scope is closed');
    expect(code(() => SecretBox.copyOf(new Uint8Array(0)))).toBe('INVALID_INPUT:source must be a non-empty Uint8Array');
    expect(code(() => withScope(() => Promise.resolve(1)))).toMatch(/^ASYNC_IN_SYNC_USE:withScope\(\) callback returned a promise/);
    const b = SecretBox.random(4); b.dispose();
    expect(code(() => b.use(() => 0))).toBe('DISPOSED:secret has been disposed');
  });

  it('assertNoSecretBox depth/size limits are exact (secretBox.ts:262-269)', () => {
    const nest = (n: number): unknown => { let o: unknown = {}; for (let i = 0; i < n; i++) o = { o }; return o; };
    expect(() => assertNoSecretBox(nest(15))).not.toThrow();           // depth boundary (MAX_DEPTH = 16)
    expect(code(() => assertNoSecretBox(nest(40)))).toMatch(/^INVALID_INPUT/);
    expect(code(() => assertNoSecretBox({ a: { b: [SecretBox.random(4)] } }))).toBe('SECRET_IN_PAYLOAD:payload contains a SecretBox');
    expect(code(() => assertNoSecretBox({ ok: new Uint8Array(100_000) }))).toBeUndefined(); // typed arrays are leaves
    expect(() => assertNoSecretBox(new ArrayBuffer(8))).not.toThrow();
    expect(code(() => assertNoSecretBox({ a: new Map([[1, SecretBox.random(4)]]) }))).toMatch(/^SECRET_IN_PAYLOAD/);
    expect(code(() => assertNoSecretBox([...Array(10_001)].map(() => ({}))))).toMatch(/^INVALID_INPUT/);
  });
});
