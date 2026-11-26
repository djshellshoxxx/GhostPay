import { describe, expect, it } from 'vitest';
import { isVerifiable, parsePendingRef } from './compat.js';

const HASH = '0x' + 'AB'.repeat(32);
const NORMALIZED = '0x' + 'ab'.repeat(32);

describe('parsePendingRef runtime kind boundary', () => {
  it('rejects unsupported kinds even with a valid 32-byte hash', () => {
    for (const kind of ['transactionHash', 'TxHash', 'txhash', '', null, undefined, 0, {}, ['txHash']]) {
      expect(parsePendingRef(kind as never, HASH)).toEqual({
        ok: false,
        error: 'invalid pending reference kind',
      });
    }
  });

  it('preserves the three supported kinds, normalized hash, and direct-verification boundary', () => {
    for (const kind of ['txHash', 'safeTxHash', 'userOpHash'] as const) {
      const result = parsePendingRef(kind, HASH);
      expect(result).toEqual({ ok: true, value: { kind, hash: NORMALIZED } });
      if (result.ok) expect(isVerifiable(result.value)).toBe(kind === 'txHash');
    }
  });

  it('still rejects malformed hashes for supported kinds', () => {
    for (const kind of ['txHash', 'safeTxHash', 'userOpHash'] as const) {
      for (const hash of ['0x', '0x12', '0x' + 'gg'.repeat(32), null]) {
        expect(parsePendingRef(kind, hash)).toEqual({ ok: false, error: 'hash must be 32 bytes' });
      }
    }
  });
});
