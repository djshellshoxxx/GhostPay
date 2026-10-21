import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isUsableRecipient, resolveDonation } from './index.js';

export const FAKE = '0x000000000000000000000000000000000000d0d0' as const;

describe('recipient validation', () => {
  it('accepts the fake address, checksummed and upper-hex forms', () => {
    expect(isUsableRecipient(FAKE)).toBe(true);
    expect(isUsableRecipient(getAddress(FAKE))).toBe(true);
  });
  it('rejects bad checksum, zero, short, non-hex, non-string', () => {
    const cs = getAddress('0x52908400098527886E0F7030069857D2E4169EE7');
    const flipped = cs.replace(/[a-f]/i, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    expect(isUsableRecipient(cs)).toBe(true);
    expect(isUsableRecipient(flipped)).toBe(false);
    expect(isUsableRecipient('0x0000000000000000000000000000000000000000')).toBe(false);
    expect(isUsableRecipient('0x1234')).toBe(false);
    expect(isUsableRecipient('0xzz00000000000000000000000000000000d0d0')).toBe(false);
    expect(isUsableRecipient(5)).toBe(false);
  });
});

describe('resolveDonation', () => {
  it('defaults are on at 965 ppm', () => {
    expect(DEFAULT_SETTINGS).toEqual({ enabled: true, ppm: 965 });
  });
  it('unset, empty or invalid recipient is unavailable', () => {
    expect(resolveDonation(DEFAULT_SETTINGS, {})).toEqual({ status: 'unavailable', reason: 'no_recipient' });
    expect(resolveDonation(DEFAULT_SETTINGS, { donationRecipient: null })).toEqual({
      status: 'unavailable',
      reason: 'no_recipient',
    });
    expect(resolveDonation(DEFAULT_SETTINGS, { donationRecipient: '' })).toEqual({
      status: 'unavailable',
      reason: 'no_recipient',
    });
    expect(
      resolveDonation(DEFAULT_SETTINGS, { donationRecipient: '0x0000000000000000000000000000000000000000' }),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid_recipient',
    });
    expect(resolveDonation({ enabled: true, ppm: -5 }, { donationRecipient: FAKE })).toEqual({
      status: 'unavailable',
      reason: 'invalid_ppm',
    });
  });
  it('active and disabled', () => {
    expect(resolveDonation(DEFAULT_SETTINGS, { donationRecipient: FAKE })).toEqual({
      status: 'active',
      ppm: 965,
      recipient: FAKE,
    });
    expect(resolveDonation({ enabled: false, ppm: 965 }, { donationRecipient: FAKE }).status).toBe(
      'disabled',
    );
  });
});
