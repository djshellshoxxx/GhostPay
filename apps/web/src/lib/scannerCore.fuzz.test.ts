import { generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { ScanSession, type WireLog } from './scannerCore';

/** Deterministic malformed-wire corpus: repeatable seed, varied bytes and lengths, bounded batches. */
describe('scanner malformed-wire acceptance corpus', () => {
  it('processes one million generated wire logs without throwing or matching another owner', () => {
    const keys = generateKeySet();
    const spend = Array.from(keys.spendingPublicKey, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const session = new ScanSession(unsafeRevealSecret(keys.viewingSecret), spend);
    let state = 0x47504d31;
    const next = (): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
    const bytes = (length: number): string => {
      let out = '0x';
      for (let index = 0; index < length; index++) out += (next() & 255).toString(16).padStart(2, '0');
      return out;
    };
    try {
      for (let batch = 0; batch < 200; batch++) {
        const logs: WireLog[] = [];
        for (let index = 0; index < 5000; index++) logs.push({
          id: `${String(batch)}:${String(index)}`, schemeId: BigInt(next() & 3),
          stealthAddress: bytes(20), ephemeralPublicKey: bytes(next() % 36),
          metadata: bytes(next() % 60), skipTag: (next() & 1) === 1,
        });
        expect(session.processBatch(logs)).toEqual([]);
      }
      expect(session.scanned).toBe(1_000_000);
    } finally {
      session.dispose();
    }
  }, 180_000);
});
