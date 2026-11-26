import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, generateSession, revealViewingKey, subscribeSessionExpiryCheck, suspendSession } from './session';
import { MemoryTagStore, TagVault } from './tags';

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('tag unlock respects idle-session authority', () => {
  it('keeps ordinary standalone empty-session use and consumes the supplied key', async () => {
    const key = new Uint8Array(32).fill(7);
    const vault = new TagVault(new MemoryTagStore());
    await vault.unlock(key);
    expect(vault.unlocked).toBe(true);
    expect(key.every((byte) => byte === 0)).toBe(true);
    vault.lock();
  });

  it('rejects a retained session before storage access and wipes the supplied copy', async () => {
    generateSession();
    const key = revealViewingKey();
    const store = new MemoryTagStore();
    const read = vi.spyOn(store, 'getSnapshot');
    const vault = new TagVault(store);
    suspendSession();
    await expect(vault.unlock(key)).rejects.toThrow(/locked after inactivity/);
    expect(vault.unlocked).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(key.every((byte) => byte === 0)).toBe(true);
  });

  it('wipes supplied bytes when the synchronous expiry observation rejects', async () => {
    const key = new Uint8Array(32).fill(7);
    const store = new MemoryTagStore();
    const read = vi.spyOn(store, 'getSnapshot');
    const vault = new TagVault(store);
    const off = subscribeSessionExpiryCheck(() => { throw new Error('synthetic expiry observation unavailable'); });
    try {
      await expect(vault.unlock(key)).rejects.toThrow('synthetic expiry observation unavailable');
      expect(vault.unlocked).toBe(false);
      expect(read).not.toHaveBeenCalled();
      expect(key.every((byte) => byte === 0)).toBe(true);
    } finally {
      off();
    }
  });
});
