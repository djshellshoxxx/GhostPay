import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from './session';
import { MemoryTagStore, TagVault, type TagPayload } from './tags';

const payload: TagPayload = {
  stealthAddress: `0x${'1'.repeat(40)}`,
  announcementId: `0x${'a'.repeat(64)}:0`,
  logIndex: 0,
  clientLabel: 'Private local customer',
};
const key = (): Uint8Array => new Uint8Array(32).fill(7);

afterEach(() => { clearSession(); vi.restoreAllMocks(); });

describe('tag access interval revocation', () => {
  it('notifies after keys are installed or erased, keeps ordinary writes in the same access interval, and preserves ciphertext', async () => {
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    const states: boolean[] = [];
    const off = vault.subscribeAccess(() => { states.push(vault.unlocked); });
    await vault.unlock(key());
    expect(states.at(-1)).toBe(true);
    const access = vault.getAccessRevision();
    await vault.save(84532, payload);
    expect(vault.getAccessRevision()).toBe(access);
    const saved = await store.getSnapshot();
    expect(JSON.stringify(saved)).not.toContain(payload.clientLabel);

    vault.lock();
    expect(states.at(-1)).toBe(false);
    expect(vault.getAccessRevision()).not.toBe(access);
    expect(await store.getSnapshot()).toEqual(saved);
    await expect(vault.list()).rejects.toThrow(/locked/i);
    await vault.unlock(key());
    expect(states.at(-1)).toBe(true);
    expect((await vault.list(84532))[0]?.clientLabel).toBe(payload.clientLabel);
    expect(await store.getSnapshot()).toEqual(saved);
    off();
    const count = states.length;
    vault.lock();
    expect(states).toHaveLength(count);
  });

  it('continues access revocation when one presentation observer throws', async () => {
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    await vault.unlock(key());
    await vault.save(84532, payload);
    const saved = await store.getSnapshot();
    const observed = vi.fn(() => vault.unlocked);
    const stopBroken = vault.subscribeAccess(() => { throw new Error('synthetic observer failure'); });
    const stopObserved = vault.subscribeAccess(observed);
    expect(() => { vault.lock(); }).not.toThrow();
    expect(observed).toHaveBeenCalledOnce();
    expect(observed).toHaveReturnedWith(false);
    await expect(vault.find(84532, payload.stealthAddress)).rejects.toThrow(/locked/i);
    expect(await store.getSnapshot()).toEqual(saved);
    stopBroken(); stopObserved();
  });

  it('never announces unlocked access after an obsolete unlock finishes', async () => {
    const store = new MemoryTagStore();
    const vault = new TagVault(store);
    await vault.unlock(key());
    await vault.save(84532, payload);
    vault.lock();
    const saved = await store.getSnapshot();
    const read = store.getSnapshot.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(store, 'getSnapshot').mockImplementationOnce(async () => { await gate; return read(); });
    const observed: boolean[] = [];
    const off = vault.subscribeAccess(() => { observed.push(vault.unlocked); });
    const supplied = key();
    const unlocking = vault.unlock(supplied);
    vault.lock();
    release();
    await expect(unlocking).rejects.toThrow(/changed|locked/i);
    expect(observed).not.toContain(true);
    expect(vault.unlocked).toBe(false);
    expect(supplied.every((byte) => byte === 0)).toBe(true);
    expect(await store.getSnapshot()).toEqual(saved);
    off();
  });
});
