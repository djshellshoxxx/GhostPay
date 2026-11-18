import { SecretBox } from '@ghostpay/secret-box';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStealthExport } from './paymentKeyExport';
import { VECTORS, VECTOR_PASS } from './paymentKeyExport.testutil';
import { captureSessionGuard, clearSession, generateSession, getSessionBackup, getSessionPublic, importSession, subscribeSession, withSessionSecrets } from './session';

beforeEach(() => { clearSession(); });
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

describe('atomic seller-key replacement', () => {
  it.each([1, 2, 3])('preserves the original keys and disposes staged keys when replacement box %s fails', async (failedBox) => {
    const before = generateSession();
    const custody = getSessionBackup();
    const unchanged = captureSessionGuard();
    const opened = await openStealthExport(VECTORS.files.master.text, VECTOR_PASS);
    if (opened.kind !== 'master') throw new Error('master fixture required');
    const notices = vi.fn();
    const unsubscribe = subscribeSession(notices);
    const copied: SecretBox[] = [];
    const scalars: Uint8Array[] = [];
    const actualCopy = SecretBox.copyOf.bind(SecretBox);
    let calls = 0;
    vi.spyOn(SecretBox, 'copyOf').mockImplementation((source, options) => {
      scalars.push(source);
      if (++calls === failedBox) throw new Error('simulated allocation failure');
      const next = actualCopy(source, options);
      copied.push(next);
      return next;
    });
    try {
      expect(() => opened.keys.install()).toThrow('simulated allocation failure');
      expect(getSessionPublic()).toBe(before);
      expect(getSessionBackup()).toBe(custody);
      expect(unchanged).not.toThrow();
      expect(withSessionSecrets(({ keys }) => Array.from(keys.spendingPublicKey))).toEqual(
        Array.from(Buffer.from(before.spendingPublicKey, 'hex')),
      );
      expect(notices).not.toHaveBeenCalled();
      expect(opened.keys.disposed).toBe(true);
      expect(copied.every((key) => key.disposed)).toBe(true);
      expect(scalars.every((key) => key.every((byte) => byte === 0))).toBe(true);
    } finally {
      unsubscribe();
      opened.keys.dispose();
      for (const key of copied) key.dispose();
    }
  });

  it('publishes exactly one completed replacement after all keys have been staged', () => {
    generateSession();
    const oldGuard = captureSessionGuard();
    const observed: ReturnType<typeof getSessionPublic>[] = [];
    const unsubscribe = subscribeSession(() => { observed.push(getSessionPublic()); });
    try {
      const next = importSession({ spendingKeyHex: '11'.repeat(32), viewingKeyHex: '22'.repeat(32), signingKeyHex: '33'.repeat(32) });
      expect(observed).toEqual([next]);
      expect(getSessionPublic()).toBe(next);
      expect(getSessionBackup()).toMatchObject({ verified: true, backedUp: true });
      expect(oldGuard).toThrow(/changed during this action/);
    } finally {
      unsubscribe();
    }
  });
});
