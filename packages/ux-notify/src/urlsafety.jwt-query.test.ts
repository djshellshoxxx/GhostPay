import { describe, expect, it } from 'vitest';
import { classifyRequest, DEFAULT_CACHE_CONFIG } from './cache-policy.js';
import { hasSensitiveQuery } from './urlsafety.js';

// Synthetic compact JWS; no valid signature, private credential or network interaction.
const JWS =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGVzdHNpZ25hdHVyZTEyMzQ1Ng';
const ORIGIN = 'https://app.example';

describe('opaque signed-token query secrecy', () => {
  it('recognizes a long dot-separated JWS even when the parameter name is neutral', () => {
    expect(hasSensitiveQuery(`?v=${JWS}`)).toBe(true);
  });

  it('recognizes percent-encoded dots after URL query decoding', () => {
    expect(hasSensitiveQuery(`?v=${JWS.replaceAll('.', '%2E')}`)).toBe(true);
  });

  it('prevents an otherwise immutable asset URL carrying a JWS from entering cache-first', () => {
    expect(
      classifyRequest(
        { ...DEFAULT_CACHE_CONFIG, origin: ORIGIN },
        { url: `${ORIGIN}/assets/app-12345678.js?v=${JWS}`, method: 'GET' },
      ),
    ).toEqual({
      strategy: 'network-only',
      cacheable: false,
      offlineFallback: false,
      reason: 'sensitive_query',
    });
  });

  it('preserves innocuous dotted versions and existing opaque/key detection', () => {
    expect(hasSensitiveQuery('?v=1.2.3')).toBe(false);
    expect(hasSensitiveQuery('?v=abcdefghijkl.efg.hijklmn')).toBe(false);
    expect(hasSensitiveQuery('?v=' + 'a'.repeat(40))).toBe(true);
    expect(hasSensitiveQuery('?token=short')).toBe(true);
  });
});
