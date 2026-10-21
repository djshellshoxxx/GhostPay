import { describe, expect, it } from 'vitest';
import { SchemaError, checkExpiry } from './index.js';
import { NOW, sampleInvoice } from './fixtures.testutil.js';

const inv = sampleInvoice(); // quote expires NOW+600, invoice NOW+3600

describe('checkExpiry', () => {
  it('valid well before expiry', () => {
    expect(checkExpiry(inv, NOW)).toEqual({
      invoiceExpired: false,
      quoteExpired: false,
      secondsRemaining: 3600,
    });
  });
  it('invoice expiry is exclusive: valid at expiresAt-1, expired at expiresAt and after', () => {
    expect(checkExpiry(inv, inv.expiresAt - 1)).toMatchObject({ invoiceExpired: false, secondsRemaining: 1 });
    expect(checkExpiry(inv, inv.expiresAt)).toMatchObject({ invoiceExpired: true, secondsRemaining: 0 });
    expect(checkExpiry(inv, inv.expiresAt + 1)).toMatchObject({ invoiceExpired: true, secondsRemaining: 0 });
  });
  it('quote expiry is independent of invoice expiry', () => {
    expect(checkExpiry(inv, inv.quote.expiresAt - 1)).toMatchObject({
      quoteExpired: false,
      invoiceExpired: false,
    });
    expect(checkExpiry(inv, inv.quote.expiresAt)).toMatchObject({
      quoteExpired: true,
      invoiceExpired: false,
    });
  });
  it('clock at zero and at the largest safe integer', () => {
    expect(checkExpiry(inv, 0).invoiceExpired).toBe(false);
    expect(checkExpiry(inv, Number.MAX_SAFE_INTEGER)).toMatchObject({
      invoiceExpired: true,
      quoteExpired: true,
      secondsRemaining: 0,
    });
  });
  it('already-expired-at-creation invoice (expiresAt 0)', () => {
    const e = sampleInvoice({
      expiresAt: 0,
      quote: { source: 'x', timestamp: 0, expiresAt: 0, maxSlippageBps: 0 },
    });
    expect(checkExpiry(e, 0)).toMatchObject({ invoiceExpired: true, quoteExpired: true });
  });
  it('rejects a bad clock (fail closed)', () => {
    for (const now of [
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 2,
      '5' as unknown as number,
      undefined as unknown as number,
    ]) {
      expect(() => checkExpiry(inv, now)).toThrow(SchemaError);
    }
  });
});
