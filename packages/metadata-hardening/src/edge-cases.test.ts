import { describe, expect, it } from 'vitest';
import { orderOutputs, normalizeFeeRate } from './btc.js';
import { defaultHardening, validateHardening } from './catalogue.js';
import { MetadataHardeningError } from './guard.js';
import { padBody } from './release.js';
import { assertNoUserAddressFilter } from './scan.js';
import { findUnsafeAnchors, sriDigest, verifySri } from './web.js';

const ME = `0x${'ab'.repeat(20)}`;

describe('edge cases found while closing coverage gaps', () => {
  it('validateHardening throws INVALID_INPUT for an unknown tagMode string', () => {
    expect(() => validateHardening({ enabled: defaultHardening().enabled, tagMode: 'bogus' })).toThrow(MetadataHardeningError);
  });
  it('padBody rejects a toJSON that injects its own pad member', () => {
    expect(() => padBody({ toJSON: () => ({ pad: 'xx' }) })).toThrow(MetadataHardeningError);
  });
  it('assertNoUserAddressFilter rejects values that are not hex instead of skipping them', () => {
    expect(() => assertNoUserAddressFilter({ address: 'not-an-address', topics: ['not-hex', ['also-not-hex']] }, [ME])).toThrow(MetadataHardeningError);
  });
  it('the anchor lint stops cleanly when the input ends right after "="', () => {
    for (const s of ['<a target=', '<a target= ', '<a target=\n', '<a rel =', '<a ="']) expect(findUnsafeAnchors(s)).toEqual([]);
  });
  it('verifySri treats tokens with an empty algorithm part as unknown', () => {
    const d = sriDigest(new Uint8Array(1));
    expect(verifySri(new Uint8Array(1), `-abc ?x ${d}`)).toBe(true);
    expect(verifySri(new Uint8Array(1), '- ?')).toBe(false);
  });
  it('orderOutputs breaks amount ties by script and orders by amount first', () => {
    const r = orderOutputs('regtest', [
      { amountSats: 5n, scriptPubKey: 'bb' },
      { amountSats: 1n, scriptPubKey: 'ff' },
      { amountSats: 5n, scriptPubKey: 'AA' },
      { amountSats: 9n, scriptPubKey: '00' },
    ], 'bip69');
    expect(r.order).toEqual([1, 2, 0, 3]);
  });
  it('normalizeFeeRate raises a rate below the minimum onto the grid', () => {
    expect(normalizeFeeRate('regtest', 0.5, { step: 1, minRate: 3 })).toBe(3);
    expect(normalizeFeeRate('regtest', 0.5, { step: 2, minRate: 3 })).toBe(4);
  });
});
