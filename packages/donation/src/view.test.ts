import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DONATION_TEXT_KEYS, buildDonationLines } from './index.js';
import { FAKE } from './recipient.test.js';

const base = {
  settings: DEFAULT_SETTINGS,
  config: { donationRecipient: FAKE },
  gross: 1_000_000_000n,
  decimals: 6,
};

describe('buildDonationLines', () => {
  it('returns an itemised keyed line', () => {
    const l = buildDonationLines(base);
    expect(l).not.toBeNull();
    expect(l?.titleKey).toBe('donation.line.title');
    expect(l?.amount).toBe(965_000n);
    expect(l?.percentText).toBe('0.0965');
    expect(l?.enabled).toBe(true);
    expect(l?.includedInRouterFee).toBe(false);
    expect(l?.includedInNet).toBe(false);
    expect(l?.warningKeys).toEqual(['donation.warning.publicLink', 'donation.notBundledWithRouterFee']);
    expect(l?.zeroAction).toEqual({ key: DONATION_TEXT_KEYS.zero, setsPpm: 0 });
    expect(l?.editableRate).toEqual({ ppm: 965, minPpm: 0, maxPpm: 50_000 });
    expect(l?.recipient).toBe(FAKE);
  });
  it('disabled still shows the row with amount 0', () => {
    const l = buildDonationLines({ ...base, settings: { enabled: false, ppm: 965 } });
    expect(l?.enabled).toBe(false);
    expect(l?.amount).toBe(0n);
  });
  it('flags dust', () => {
    expect(buildDonationLines({ ...base, gross: 1000n })?.belowDust).toBe(true);
  });
  it('unavailable gives no line', () => {
    expect(buildDonationLines({ ...base, config: {} })).toBeNull();
  });
});
