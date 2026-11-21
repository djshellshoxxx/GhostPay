import { SecretBox } from '@ghostpay/secret-box';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStealthExport, type OpenedStealthExport } from './paymentKeyExport';
import { VECTORS, VECTOR_PASS } from './paymentKeyExport.testutil';
import { clearSession, generateSession, getSessionPublic, subscribeSessionExpiryCheck, suspendSession } from './session';
import * as codec from './stealthExport';

const subscriptions: (() => void)[] = [];
const recovered: OpenedStealthExport[] = [];

beforeEach(() => { clearSession(); });
afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  for (const opened of recovered.splice(0)) if (opened.kind !== 'public') opened.keys.dispose();
  vi.restoreAllMocks();
  clearSession();
});

function expireOnNextBoundary(): void {
  let pending = true;
  subscriptions.push(subscribeSessionExpiryCheck(() => {
    if (pending) { pending = false; suspendSession(); }
  }));
}

async function open(format: 'single' | 'master'): Promise<OpenedStealthExport> {
  const opened = await openStealthExport(VECTORS.files[format].text, VECTOR_PASS);
  recovered.push(opened);
  return opened;
}

describe('recovered key authority at synchronous and asynchronous idle boundaries', () => {
  it('refuses and disposes an expired raw-payment loan before returning private-key text, without a browser event', async () => {
    const opened = await open('single');
    if (opened.kind !== 'keypair') throw new Error('payment fixture required');
    expireOnNextBoundary();
    expect(() => opened.keys.rawKeyFile(0, true)).toThrow(/changed during this action/);
    expect(opened.keys.disposed).toBe(true);
  });

  it('preserves the loaded wallet when a recovered master install observes expiration before replacement', async () => {
    const original = generateSession();
    const opened = await open('master');
    if (opened.kind !== 'master') throw new Error('master fixture required');
    expireOnNextBoundary();
    expect(() => opened.keys.install()).toThrow(/changed during this action/);
    expect(getSessionPublic()).toBe(original);
    expect(opened.keys.disposed).toBe(true);
  });

  it('refuses an old recovered payment after a different wallet is installed without React lifecycle subscribers', async () => {
    const opened = await open('single');
    if (opened.kind !== 'keypair') throw new Error('payment fixture required');
    generateSession();
    expect(() => opened.keys.rawKeyFile(0, true)).toThrow(/changed during this action/);
    expect(opened.keys.disposed).toBe(true);
  });

  it.each(['single', 'master'] as const)('disposes %s keys when decryption finishes after expiry, before any result is handed to the caller', async (format) => {
    const boxes: SecretBox[] = [];
    const copy = SecretBox.copyOf.bind(SecretBox);
    vi.spyOn(SecretBox, 'copyOf').mockImplementation((bytes, options) => {
      const box = copy(bytes, options);
      boxes.push(box);
      return box;
    });
    if (format === 'single') {
      const decrypt = codec.decryptPaymentKeys;
      vi.spyOn(codec, 'decryptPaymentKeys').mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        expireOnNextBoundary();
        return result;
      });
    } else {
      const decrypt = codec.decryptMasterBackup;
      vi.spyOn(codec, 'decryptMasterBackup').mockImplementation(async (...args) => {
        const result = await decrypt(...args);
        expireOnNextBoundary();
        return result;
      });
    }
    await expect(open(format)).rejects.toThrow(/changed during this action/);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((box) => box.disposed)).toBe(true);
  });

  it('keeps fresh empty-session recovery usable with the original exported spending authority', async () => {
    const opened = await open('single');
    if (opened.kind !== 'keypair') throw new Error('payment fixture required');
    const file = opened.keys.rawKeyFile(0, true);
    // Compare booleans so a failing assertion never prints plaintext test-key material.
    expect(file.text === VECTORS.files.rawPrivateKey.text).toBe(true);
    expect(getSessionPublic()).toBeUndefined();
  });
});
