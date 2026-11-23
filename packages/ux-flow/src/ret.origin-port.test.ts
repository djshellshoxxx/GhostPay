import { describe, expect, it } from 'vitest';
import { encodeProof } from './proof.js';
import { buildReturnUrl, canonicalOrigin, isAllowedReturn } from './ret.js';

const LONG_HOST = [
  'a'.repeat(63),
  'b'.repeat(63),
  'c'.repeat(63),
  'd'.repeat(61),
].join('.');
const LONG_ORIGIN = `https://${LONG_HOST}:65535`;
const SHORT_ORIGIN = 'https://shop.example.com:8443';
const PROOF = encodeProof({
  nonce: 'deadbeefdeadbeefdeadbeefdeadbeef',
  chainId: 1,
  txHash: `0x${'cd'.repeat(32)}`,
});

describe('canonical long HTTPS origin with explicit port', () => {
  it('accepts the longest DNS hostname and five-digit port when URL origin is canonical', () => {
    expect(LONG_HOST.length).toBe(253);
    expect(LONG_ORIGIN.length).toBe(267);
    expect(new URL(LONG_ORIGIN).origin).toBe(LONG_ORIGIN);
    expect(canonicalOrigin(LONG_ORIGIN)).toBe(LONG_ORIGIN);
  });

  it('keeps existing return-to-merchant helpers usable for a valid long origin', () => {
    expect(buildReturnUrl(LONG_ORIGIN, PROOF, '/thanks')).toBe(
      `${LONG_ORIGIN}/thanks#proof=${PROOF}`,
    );
    expect(isAllowedReturn({ returnOrigin: LONG_ORIGIN }, `${LONG_ORIGIN}/thanks#proof=${PROOF}`)).toBe(true);
  });

  it('preserves ordinary and localhost-only acceptance and rejects noncanonical or unsafe origins', () => {
    expect(canonicalOrigin(SHORT_ORIGIN)).toBe(SHORT_ORIGIN);
    expect(canonicalOrigin('http://localhost:3000')).toBeNull();
    expect(canonicalOrigin('http://localhost:3000', true)).toBe('http://localhost:3000');
    for (const bad of [
      `${LONG_ORIGIN}/`,
      `${LONG_ORIGIN}?x=1`,
      `https://user@${LONG_HOST}:65535`,
      `http://${LONG_HOST}:65535`,
      `https://${LONG_HOST}:65536`,
      `https://${LONG_HOST}d`, // 254-character hostname must remain rejected without a port
    ]) {
      expect(canonicalOrigin(bad)).toBeNull();
    }
    expect(isAllowedReturn({ returnOrigin: LONG_ORIGIN }, 'https://evil.example.com/')).toBe(false);
  });
});
