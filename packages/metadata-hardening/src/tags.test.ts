import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CANONICAL_ANNOUNCER, GHOSTPAY_FINGERPRINT_SCHEME_ID, buildMinimalMetadata, classifyMetadata, describeTagMode, encodeViewTagByte, isAcceptedScheme, parseTagMode, resolveSchemePolicy, validateAnnouncerConfig, viewTagAccepts } from './tags.js';
import { seededRng, constRng } from './testutil.testutil.js';
import { MetadataHardeningError } from './guard.js';

describe('tag modes', () => {
  it('parses modes and rejects junk', () => {
    expect(parseTagMode('full')).toEqual({ kind: 'full' });
    expect(parseTagMode('ignore')).toEqual({ kind: 'ignore' });
    expect(parseTagMode('mask:3')).toEqual({ kind: 'mask', bits: 3 });
    for (const bad of ['mask:0', 'mask:8', 'mask:', 'MASK:3', '', 'drop']) {
      expect(() => parseTagMode(bad)).toThrow(MetadataHardeningError);
    }
  });
  it('full mode is the identity and exact-match', () => {
    expect(encodeViewTagByte(0xab, { kind: 'full' })).toBe(0xab);
    expect(viewTagAccepts(0xab, 0xab, { kind: 'full' })).toBe(true);
    expect(viewTagAccepts(0xac, 0xab, { kind: 'full' })).toBe(false);
  });
  it('ignore writes 0x00 and accepts any', () => {
    expect(encodeViewTagByte(0xab, { kind: 'ignore' })).toBe(0);
    expect(viewTagAccepts(0x00, 0xab, { kind: 'ignore' })).toBe(true);
  });
  it('mask keeps high bits, randomises low bits (low bits all-ones/all-zeros rng)', () => {
    expect(encodeViewTagByte(0b10110101, { kind: 'mask', bits: 3 }, constRng(0))).toBe(0b10100000);
    expect(encodeViewTagByte(0b10110101, { kind: 'mask', bits: 3 }, constRng(0xff))).toBe(0b10111111);
  });
  it('property: no false negatives in the same mode; wrong high bits rejected', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 1, max: 7 }), fc.integer({ min: 1, max: 1e6 }), (tag, bits, seed) => {
        const mode = { kind: 'mask', bits } as const;
        const w = encodeViewTagByte(tag, mode, seededRng(seed));
        return viewTagAccepts(w, tag, mode);
      }),
    );
    expect(viewTagAccepts(0x00, 0xff, { kind: 'mask', bits: 4 })).toBe(false);
  });
  it('rejects non-byte inputs and describes honestly', () => {
    expect(() => encodeViewTagByte(256, { kind: 'full' })).toThrow(MetadataHardeningError);
    expect(() => viewTagAccepts(-1, 0, { kind: 'full' })).toThrow(MetadataHardeningError);
    expect(() => viewTagAccepts(0, 1.5, { kind: 'full' })).toThrow(MetadataHardeningError);
    expect(describeTagMode({ kind: 'ignore' })).toMatch(/Other wallets may not detect/);
    expect(describeTagMode({ kind: 'full' })).toMatch(/compatibility/);
  });
});

describe('ANN-3 minimal metadata', () => {
  it('is one byte', () => {
    expect(buildMinimalMetadata(0x7f)).toEqual(new Uint8Array([0x7f]));
    expect(() => buildMinimalMetadata(300)).toThrow(MetadataHardeningError);
  });
  it('router payments must be 57 bytes; direct 1-byte is unverified', () => {
    expect(classifyMetadata(57, true)).toEqual({ accepted: true, amountStatus: 'router-metadata' });
    expect(classifyMetadata(1, true)).toEqual({ accepted: false, amountStatus: 'none', reason: 'ROUTER_NEEDS_57' });
    expect(classifyMetadata(56, true).accepted).toBe(false);
    expect(classifyMetadata(1, false)).toEqual({ accepted: true, amountStatus: 'unverified' });
    expect(classifyMetadata(57, false).amountStatus).toBe('unverified');
    expect(classifyMetadata(0, false).reason).toBe('EMPTY');
    expect(classifyMetadata(1.5, false).accepted).toBe(false);
  });
});

describe('ANN-1/2 schemes and announcer', () => {
  it('default accepts only scheme 1', () => {
    const p = resolveSchemePolicy();
    expect(isAcceptedScheme(1n, p)).toBe(true);
    expect(isAcceptedScheme(GHOSTPAY_FINGERPRINT_SCHEME_ID, p)).toBe(false);
  });
  it('custom id needs the unsafe flag', () => {
    expect(() => resolveSchemePolicy({ extraSchemeId: GHOSTPAY_FINGERPRINT_SCHEME_ID })).toThrowError(/easier to find/);
    const p = resolveSchemePolicy({ extraSchemeId: GHOSTPAY_FINGERPRINT_SCHEME_ID, unsafeFingerprintScheme: true });
    expect(isAcceptedScheme(GHOSTPAY_FINGERPRINT_SCHEME_ID, p)).toBe(true);
    expect(isAcceptedScheme(1n, p)).toBe(true);
    expect(isAcceptedScheme(2n, p)).toBe(false);
    expect(() => resolveSchemePolicy({ extraSchemeId: 1n, unsafeFingerprintScheme: true })).toThrow(MetadataHardeningError);
  });
  it('announcer config: testnet, valid, canonical flag', () => {
    expect(validateAnnouncerConfig(11155111, CANONICAL_ANNOUNCER).canonical).toBe(true);
    expect(validateAnnouncerConfig(31337, CANONICAL_ANNOUNCER.toLowerCase()).canonical).toBe(true);
    expect(validateAnnouncerConfig(31337, '0x' + '11'.repeat(20)).canonical).toBe(false);
    expect(() => validateAnnouncerConfig(1, CANONICAL_ANNOUNCER)).toThrow(MetadataHardeningError);
    expect(() => validateAnnouncerConfig(31337, '0x1234')).toThrow(MetadataHardeningError);
  });
});
