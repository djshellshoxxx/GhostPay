import { describe, expect, it } from 'vitest';
import { MAX_LIFETIME_SECONDS, requestFromUri } from './request.js';
import { buildPaymentUri } from './uri.js';
import { code, META_A, NOW } from './fixtures.testutil.js';

const farFuture = buildPaymentUri({
  target: META_A,
  amount: '1',
  asset: 'ETH',
  expiresAt: NOW + MAX_LIFETIME_SECONDS + 1,
});
const alreadyExpired = buildPaymentUri({
  target: META_A,
  amount: '1',
  asset: 'ETH',
  expiresAt: NOW - 20,
});

describe('requestFromUri maxLifetime runtime validation', () => {
  it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_VALUE])(
    'rejects invalid numeric maxLifetime %s before accepting a far-future payment link',
    (maxLifetime) => {
      expect(code(() => requestFromUri(farFuture, NOW, { maxLifetime }))).toBe('REQUEST');
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_VALUE])(
    'rejects invalid numeric maxLifetime %s even when the request is already expired',
    (maxLifetime) => {
      expect(code(() => requestFromUri(alreadyExpired, NOW, { maxLifetime }))).toBe('REQUEST');
    },
  );

  it('keeps the default lifetime bound, valid custom extension, and zero-duration override', () => {
    expect(code(() => requestFromUri(farFuture, NOW))).toBe('REQUEST');
    expect(requestFromUri(farFuture, NOW, { maxLifetime: MAX_LIFETIME_SECONDS + 5 }).expired).toBe(false);
    expect(code(() => requestFromUri(farFuture, NOW, { maxLifetime: 0 }))).toBe('REQUEST');
    expect(requestFromUri(alreadyExpired, NOW, { maxLifetime: 0 }).expired).toBe(true);
  });
});
