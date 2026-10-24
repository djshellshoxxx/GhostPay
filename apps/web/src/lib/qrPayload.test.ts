import { describe, expect, it } from 'vitest';
import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { parsePublicMetaQr } from './qrPayload';

describe('public meta-address QR', () => {
  const meta = encodeMetaAddress(generateKeySet());
  it('accepts validated public keys only, including a strict versioned public envelope', () => {
    expect(parsePublicMetaQr(meta)).toBe(meta);
    expect(parsePublicMetaQr(JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: meta }))).toBe(meta);
  });
  it('rejects unknown fields, duplicate fields, malformed points, private keys, URLs and oversized input', () => {
    for (const text of ['11'.repeat(32), 'https://example.test/#' + meta, 'x'.repeat(1025), JSON.stringify({ format: 'ghostpay-public-meta', v: 1, metaAddress: meta, registry: 'write' }), JSON.stringify({ format: 'ghostpay-public-meta', v: 2, metaAddress: meta }), '{"v":1,"v":1}', 'st:eth:0x' + '00'.repeat(66)]) {
      expect(() => parsePublicMetaQr(text)).toThrow();
    }
  });
});
