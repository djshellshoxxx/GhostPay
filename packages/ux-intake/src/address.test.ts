import { describe, expect, it } from 'vitest';
import { validateAddress } from './address.js';
import { BECH, BECHM, EVM } from './fixtures.testutil.js';

describe('validateAddress', () => {
  it('accepts lowercase EVM', () => {
    const r = validateAddress(EVM);
    expect(r).toEqual({ ok: true, value: { family: 'evm', canonical: EVM, checksumUnverified: false } });
  });
  it('flags mixed-case EVM as unverified checksum and lowercases', () => {
    const mixed = '0xA1b2c3d4e5a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5';
    const r = validateAddress(mixed);
    expect(r.ok && r.value.checksumUnverified).toBe(true);
    expect(r.ok && r.value.canonical).toBe(EVM);
  });
  it('rejects zero, short, long, non-hex EVM', () => {
    for (const s of [
      '0x' + '0'.repeat(40),
      '0x1234',
      EVM + 'a',
      '0x' + 'g'.repeat(40),
      '0X' + 'a'.repeat(40),
    ])
      expect(validateAddress(s)).toEqual({ ok: false, code: 'bad-address' });
  });
  it('accepts bech32 and bech32m vectors, including upper case', () => {
    expect(validateAddress(BECH).ok).toBe(true);
    expect(validateAddress(BECHM).ok).toBe(true);
    const up = validateAddress(BECH.toUpperCase());
    expect(up.ok && up.value.canonical).toBe(BECH);
  });
  it('rejects bad checksum, mixed case, bad hrp, bad char, short, long, no separator', () => {
    const flipped = BECH.slice(0, -1) + (BECH.endsWith('4') ? '5' : '4');
    const mixed = BECH.slice(0, 5) + BECH.slice(5).toUpperCase();
    const badHrp = 'xx' + BECH.slice(2);
    for (const s of [
      flipped,
      mixed,
      badHrp,
      'bc1' + 'b'.repeat(20),
      'bc1qqqqq',
      BECH + 'q'.repeat(60),
      'bcqqqqqqqqqqqqqqqqqq',
      '1qqqqqqqqqqqqqqqq',
      'nothing',
    ])
      expect(validateAddress(s).ok).toBe(false);
  });
  it('accepts sp-prefixed long bech32m only up to 130 chars', () => {
    expect(validateAddress('sp1' + 'q'.repeat(200)).ok).toBe(false);
  });
});
