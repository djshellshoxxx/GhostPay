import { describe, expect, it } from 'vitest';
import {
  createPaymentRequest,
  validatePaymentRequest,
  requestStatus,
  requestToUri,
  requestFromUri,
  MAX_LIFETIME_SECONDS,
  type NewRequestInput,
} from './request.js';
import { buildPaymentUri } from './uri.js';
import { code, fixedRng, META_A, NOW, SECRET } from './fixtures.testutil.js';

const input: NewRequestInput = {
  target: META_A,
  amount: '25.5',
  asset: 'USDC',
  decimals: 6,
  ttlSeconds: 3600,
  memo: 'Invoice 7',
  chainId: 1,
};

describe('create/validate', () => {
  it('creates with injected rng/clock', () => {
    const r = createPaymentRequest(input, NOW, fixedRng(0xab));
    expect(r).toEqual({
      version: 1,
      id: 'ab'.repeat(16),
      target: META_A,
      amount: '25.5',
      asset: 'USDC',
      decimals: 6,
      chainId: 1,
      memo: 'Invoice 7',
      createdAt: NOW,
      expiresAt: NOW + 3600,
    });
    expect(validatePaymentRequest(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it('uses WebCrypto by default (distinct ids)', () => {
    const { ttlSeconds, ...rest } = input;
    void rest;
    const a = createPaymentRequest({ ...input, ttlSeconds }, NOW);
    const b = createPaymentRequest({ ...input, ttlSeconds }, NOW);
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.id).not.toBe(b.id);
  });
  it('rejects bad creation args', () => {
    expect(code(() => createPaymentRequest(input, 0))).toBe('REQUEST');
    expect(code(() => createPaymentRequest(input, 1.5))).toBe('REQUEST');
    expect(code(() => createPaymentRequest({ ...input, ttlSeconds: 0 }, NOW))).toBe('REQUEST');
    expect(code(() => createPaymentRequest({ ...input, ttlSeconds: MAX_LIFETIME_SECONDS + 1 }, NOW))).toBe(
      'REQUEST',
    );
    expect(code(() => createPaymentRequest(input, NOW, () => new Uint8Array(8)))).toBe('REQUEST');
    expect(code(() => createPaymentRequest({ ...input, amount: '0' }, NOW))).toBe('AMOUNT');
    expect(code(() => createPaymentRequest({ ...input, amount: '1.1234567' }, NOW))).toBe('AMOUNT');
    expect(code(() => createPaymentRequest({ ...input, memo: 'a‮b' }, NOW))).toBe('TEXT');
    expect(createPaymentRequest({ ...input, ttlSeconds: MAX_LIFETIME_SECONDS }, NOW).expiresAt).toBe(
      NOW + MAX_LIFETIME_SECONDS,
    );
  });
  it('validate rejects tampered / unknown data', () => {
    const ok = createPaymentRequest(input, NOW, fixedRng(1));
    const mut = (o: Record<string, unknown>) => ({ ...ok, ...o });
    const cases: unknown[] = [
      null,
      [],
      'x',
      mut({ version: 2 }),
      mut({ id: 'XYZ' }),
      mut({ extra: 1 }),
      mut({ decimals: 19 }),
      mut({ decimals: 'a' }),
      mut({ target: META_A.toUpperCase().replace('ST:ETH:0X', 'st:eth:0X') }),
      mut({ createdAt: 0 }),
      mut({ expiresAt: NOW }),
      mut({ expiresAt: NOW + MAX_LIFETIME_SECONDS + 1 + 0 }),
      mut({ chainId: 0 }),
      mut({ asset: 'x' }),
      mut({ amount: 1 }),
      Object.assign(Object.create({ x: 1 }) as object, ok),
      JSON.parse('{"__proto__": {"a":1}}'),
    ];
    for (const c of cases)
      expect(
        code(() => validatePaymentRequest(c)),
        JSON.stringify(c),
      ).toBeDefined();
    const noId: Record<string, unknown> = { ...ok };
    delete noId['id'];
    expect(code(() => validatePaymentRequest(noId))).toBe('REQUEST');
    const getter = { ...ok };
    Object.defineProperty(getter, 'memo', { get: () => 'x', enumerable: true });
    expect(code(() => validatePaymentRequest(getter))).toBe('REQUEST');
    expect(code(() => validatePaymentRequest({ ...ok, [Symbol('s')]: 1 }))).toBe('REQUEST');
  });
});

describe('status', () => {
  const r = createPaymentRequest(input, NOW, fixedRng(2));
  it('pending -> expired at exact boundary', () => {
    expect(requestStatus(r, {}, NOW)).toEqual({ status: 'pending', secondsRemaining: 3600 });
    expect(requestStatus(r, {}, NOW + 3599)).toEqual({ status: 'pending', secondsRemaining: 1 });
    expect(requestStatus(r, {}, NOW + 3600)).toEqual({ status: 'expired', secondsRemaining: 0 });
    expect(requestStatus(r, {}, NOW + 99999).secondsRemaining).toBe(0);
  });
  it('paid / paid_late / cancelled precedence', () => {
    expect(requestStatus(r, { paidAt: NOW + 10 }, NOW + 20).status).toBe('paid');
    expect(requestStatus(r, { paidAt: NOW + 10 }, NOW + 9000).status).toBe('paid');
    expect(requestStatus(r, { paidAt: NOW + 3600 }, NOW + 3600).status).toBe('paid_late');
    expect(requestStatus(r, { cancelledAt: NOW + 5 }, NOW + 6).status).toBe('cancelled');
    expect(requestStatus(r, { paidAt: NOW + 1, cancelledAt: NOW + 2 }, NOW + 3).status).toBe('paid');
    expect(requestStatus(r, { paidAt: NOW + 100, cancelledAt: NOW + 5 }, NOW + 10).status).toBe('cancelled');
    expect(requestStatus(r, { paidAt: NOW + 100 }, NOW + 10).status).toBe('pending');
  });
  it('validates args', () => {
    expect(code(() => requestStatus(r, {}, -1))).toBe('REQUEST');
    expect(code(() => requestStatus(r, { paidAt: 1.2 }, NOW))).toBe('REQUEST');
    expect(code(() => requestStatus(r, { cancelledAt: -3 }, NOW))).toBe('REQUEST');
  });
});

describe('uri bridge', () => {
  const r = createPaymentRequest(input, NOW, fixedRng(3));
  it('round-trips through a link', () => {
    const u = requestToUri(r);
    expect(u).toBe(`ghostpay:${META_A}?amount=25.5&asset=USDC&chain=1&exp=${NOW + 3600}&memo=Invoice%207`);
    expect(requestFromUri(u, NOW + 100)).toEqual({
      target: META_A,
      amount: '25.5',
      asset: 'USDC',
      expiresAt: NOW + 3600,
      chainId: 1,
      memo: 'Invoice 7',
      expired: false,
      secondsRemaining: 3500,
    });
    expect(requestFromUri(u, NOW + 3600).expired).toBe(true);
    expect(requestFromUri(requestToUri(r, SECRET), NOW).secret).toBe(SECRET);
    const bare = createPaymentRequest(
      { target: META_A, amount: '1', asset: 'ETH', decimals: 18, ttlSeconds: 60 },
      NOW,
      fixedRng(4),
    );
    expect(requestFromUri(requestToUri(bare), NOW)).not.toHaveProperty('memo');
  });
  it('payer side rejects incomplete or forged-lifetime links', () => {
    expect(
      code(() => requestFromUri(buildPaymentUri({ target: META_A, amount: '1', asset: 'ETH' }), NOW)),
    ).toBe('REQUEST');
    expect(
      code(() => requestFromUri(buildPaymentUri({ target: META_A, amount: '1', expiresAt: NOW + 5 }), NOW)),
    ).toBe('REQUEST');
    expect(
      code(() => requestFromUri(buildPaymentUri({ target: META_A, asset: 'ETH', expiresAt: NOW + 5 }), NOW)),
    ).toBe('REQUEST');
    const far = buildPaymentUri({
      target: META_A,
      amount: '1',
      asset: 'ETH',
      expiresAt: NOW + MAX_LIFETIME_SECONDS + 1,
    });
    expect(code(() => requestFromUri(far, NOW))).toBe('REQUEST');
    expect(requestFromUri(far, NOW, { maxLifetime: MAX_LIFETIME_SECONDS + 5 }).expired).toBe(false);
    expect(code(() => requestFromUri('junk', NOW))).toBe('URI_FORMAT');
    expect(code(() => requestFromUri(requestToUri(r), 0))).toBe('REQUEST');
  });
});
