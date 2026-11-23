import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from './bytes.js';
import { VaultError } from './errors.js';

describe('canonical unpadded vault base64url', () => {
  it.each([
    ['Zh', 'Zg'], // nonzero pad bits after one decoded byte
    ['Zi', 'Zg'],
    ['AB', 'AA'],
    ['AR', 'AQ'],
    ['-_9', '-_8'], // nonzero pad bits after two decoded bytes
  ])('rejects %s even though atob produces the same bytes as %s', (alias, canonical) => {
    expect([...fromBase64Url(canonical)]).toEqual(
      [...Uint8Array.from(atob(canonical.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - canonical.length % 4) % 4)), c => c.charCodeAt(0))],
    );
    expect(() => fromBase64Url(alias)).toThrowError(VaultError);
    try {
      fromBase64Url(alias);
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it.each(['', 'Zg', 'AA', 'AQ', '-_8', 'Zm9v', 'Zm9vYg', 'Zm9vYmE'])(
    'preserves canonical decoding for %s',
    (encoded) => {
      expect(toBase64Url(fromBase64Url(encoded))).toBe(encoded);
    },
  );

  it('continues to reject padding, whitespace, and malformed sextet length', () => {
    for (const value of ['Zg==', ' Zg', 'Zg\\n', 'Z', 'Zm9v*']) {
      expect(() => fromBase64Url(value)).toThrowError(VaultError);
    }
  });
});
