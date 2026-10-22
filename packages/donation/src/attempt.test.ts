import { describe, expect, it } from 'vitest';
import { beginAttempt, canSendDonation, donationKey, reduceAttempt, type DonationAttempt } from './index.js';
import { FAKE } from './recipient.test.js';

const H1 = `0x${'11'.repeat(32)}` as const;
const H2 = `0x${'22'.repeat(32)}` as const;
const TOKEN = '0x00000000000000000000000000000000000070c3' as const;
const OTHER = '0x000000000000000000000000000000000000d0d1' as const;

describe('donationKey', () => {
  const k = donationKey(H1, FAKE, TOKEN, 100n);
  it('is stable and sensitive to every field', () => {
    expect(donationKey(H1, FAKE, TOKEN, 100n)).toBe(k);
    expect(donationKey(H2, FAKE, TOKEN, 100n)).not.toBe(k);
    expect(donationKey(H1, OTHER, TOKEN, 100n)).not.toBe(k);
    expect(donationKey(H1, FAKE, OTHER, 100n)).not.toBe(k);
    expect(donationKey(H1, FAKE, 'native', 100n)).not.toBe(k);
    expect(donationKey(H1, FAKE, TOKEN, 101n)).not.toBe(k);
  });
  it('validates inputs', () => {
    expect(() => donationKey('0x12', FAKE, TOKEN, 1n)).toThrow(/hash/);
    expect(() => donationKey(H1, '0x00', TOKEN, 1n)).toThrow(/address/);
    expect(() => donationKey(H1, FAKE, '0x00', 1n)).toThrow(/address/);
    expect(() => donationKey(H1, FAKE, TOKEN, 0n)).toThrow(/amount/);
    expect(() => donationKey(H1, FAKE, TOKEN, 1n << 256n)).toThrow(/amount/);
  });
});

describe('attempt reducers', () => {
  const key = donationKey(H1, FAKE, TOKEN, 100n);
  const p = beginAttempt(undefined, H1, key);
  it('begin is idempotent and validates', () => {
    expect(p).toEqual({ paymentTxHash: H1, key, status: 'pending' });
    const sent = reduceAttempt(p, { type: 'sent', txHash: H2 });
    expect(beginAttempt(sent, H1, key)).toBe(sent);
    expect(() => beginAttempt(undefined, '0x1', key)).toThrow();
    expect(() => beginAttempt(undefined, H1, '0x1')).toThrow();
  });
  it('happy paths and canSend', () => {
    expect(canSendDonation(p)).toBe(true);
    const s = reduceAttempt(p, { type: 'sent', txHash: H2 });
    expect(s).toEqual({ ...p, status: 'sent', donationTxHash: H2 });
    expect(canSendDonation(s)).toBe(false);
    const f = reduceAttempt(p, { type: 'failed' });
    expect(canSendDonation(f)).toBe(false);
    expect(reduceAttempt(f, { type: 'retry' }).status).toBe('pending');
    expect(reduceAttempt(f, { type: 'sent', txHash: H2 }).status).toBe('sent');
    expect(reduceAttempt(p, { type: 'skipped' }).status).toBe('skipped');
  });
  it('illegal transitions throw INVALID_STATE', () => {
    const sent: DonationAttempt = reduceAttempt(p, { type: 'sent', txHash: H2 });
    const skipped = reduceAttempt(p, { type: 'skipped' });
    const failed = reduceAttempt(p, { type: 'failed' });
    for (const [a, e] of [
      [sent, { type: 'sent', txHash: H2 }],
      [sent, { type: 'failed' }],
      [sent, { type: 'retry' }],
      [skipped, { type: 'sent', txHash: H2 }],
      [skipped, { type: 'skipped' }],
      [failed, { type: 'failed' }],
      [failed, { type: 'skipped' }],
      [p, { type: 'retry' }],
    ] as const) {
      expect(() => reduceAttempt(a, e)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
    }
    expect(() => reduceAttempt(p, { type: 'sent', txHash: '0x1' })).toThrow(
      expect.objectContaining({ code: 'INVALID_HASH' }),
    );
  });
});
