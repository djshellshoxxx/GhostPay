import { afterEach, describe, expect, it, vi } from 'vitest';

const made: Uint8Array[] = [];
vi.mock('@ghostpay/core-crypto', async (orig) => {
  const m = await orig<typeof import('@ghostpay/core-crypto')>();
  return {
    ...m,
    secretScalarFromBytes: (b: Uint8Array) => {
      const r = m.secretScalarFromBytes(b);
      made.push(r);
      return r;
    },
  };
});

import { clearSession, importSession } from './session';

afterEach(() => {
  clearSession();
  made.length = 0;
});

describe('importSession failure paths', () => {
  it('zeroizes already-wrapped keys when a later key is rejected', () => {
    expect(() => importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '00'.repeat(32) })).toThrow(/not a valid/);
    expect(made.length).toBeGreaterThan(0);
    for (const k of made) expect(k.every((b) => b === 0)).toBe(true);
  });
  it('zeroizes all wrapped keys when spending equals viewing', () => {
    expect(() => importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '11'.repeat(32) })).toThrow(/must differ/);
    expect(made.length).toBe(2);
    for (const k of made) expect(k.every((b) => b === 0)).toBe(true);
  });
});
