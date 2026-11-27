import { describe, expect, it, vi } from 'vitest';
import { UserFacingError } from './errors';
import {
  RECONCILIATION_PRESENCE_PREFIX,
  currentReconciliationPresence,
  presenceSlot,
  readPresence,
  trackReconciliationPresence,
  type PresenceStorage,
} from './reconciliationPresence';
import type { ReconciliationVaultStore } from './reconciliationVault';
import { checkpointSlot } from './scanCursorSlot';

const VIEWING_KEY = new Uint8Array(32).fill(5);
const KEY_ID = 'a'.repeat(64);
const SLOT = presenceSlot(VIEWING_KEY, 84532, KEY_ID);

class MapStorage implements PresenceStorage {
  public readonly data = new Map<string, string>();
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
  public removeItem(key: string): void { this.data.delete(key); }
}

function memoryStore(): ReconciliationVaultStore & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: (key) => Promise.resolve(data.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard();
      if ((data.get(key) ?? null) !== expected) return Promise.resolve(false);
      data.set(key, next);
      return Promise.resolve(true);
    },
  };
}
const noGuard = (): void => undefined;

describe('reconciliation vault presence slot (LATE-M1)', () => {
  it('is blinded by the viewing key and distinct per chain, key id and from the checkpoint slot', () => {
    expect(SLOT).toMatch(new RegExp(`^${RECONCILIATION_PRESENCE_PREFIX.replaceAll('.', '\\.')}[0-9a-f]{64}$`));
    expect(SLOT).not.toContain(KEY_ID);
    expect(presenceSlot(new Uint8Array(32).fill(6), 84532, KEY_ID)).not.toBe(SLOT);
    expect(presenceSlot(VIEWING_KEY, 11155111, KEY_ID)).not.toBe(SLOT);
    expect(presenceSlot(VIEWING_KEY, 84532, 'b'.repeat(64))).not.toBe(SLOT);
    const checkpointName = checkpointSlot(VIEWING_KEY, 84532, KEY_ID);
    expect(SLOT.slice(RECONCILIATION_PRESENCE_PREFIX.length)).not.toBe(checkpointName.slice(checkpointName.lastIndexOf('.') + 1));
    expect(() => presenceSlot(new Uint8Array(31), 84532, KEY_ID)).toThrow();
  });

  it('reads only the two recorded states; anything else, or an unreadable slot, is unknown', () => {
    const storage = new MapStorage();
    expect(readPresence(undefined, SLOT)).toBe('unknown');
    expect(readPresence(storage, undefined)).toBe('unknown');
    expect(readPresence(storage, SLOT)).toBe('unknown');
    for (const value of ['absent', 'present'] as const) {
      storage.setItem(SLOT, value);
      expect(readPresence(storage, SLOT)).toBe(value);
    }
    for (const value of ['', 'Absent', 'absent ', '{"absent":true}', '1']) {
      storage.setItem(SLOT, value);
      expect(readPresence(storage, SLOT)).toBe('unknown');
    }
    const broken: PresenceStorage = { getItem: () => { throw new Error('denied'); }, setItem: vi.fn(), removeItem: vi.fn() };
    expect(readPresence(broken, SLOT)).toBe('unknown');
  });
});

describe('presence tracking around a reconciliation vault store (LATE-M1)', () => {
  it('records absent on an empty read and present on a stored vault, and never turns present back into absent', async () => {
    const storage = new MapStorage();
    const inner = memoryStore();
    const store = trackReconciliationPresence(inner, storage, SLOT);
    expect(await store.read('scope')).toBeNull();
    expect(readPresence(storage, SLOT)).toBe('absent');
    expect(await store.compareAndSwap('scope', null, 'ciphertext', noGuard)).toBe(true);
    expect(readPresence(storage, SLOT)).toBe('present');
    expect(await store.read('scope')).toBe('ciphertext');
    // A vault deleted elsewhere is still treated as one that may exist.
    inner.data.clear();
    expect(await store.read('scope')).toBeNull();
    expect(readPresence(storage, SLOT)).toBe('present');
  });

  it('records present when it reads a vault this build never wrote (an older build or another tab)', async () => {
    const storage = new MapStorage();
    storage.setItem(SLOT, 'absent');
    const inner = memoryStore();
    inner.data.set('scope', 'older ciphertext');
    expect(await trackReconciliationPresence(inner, storage, SLOT).read('scope')).toBe('older ciphertext');
    expect(readPresence(storage, SLOT)).toBe('present');
  });

  it('announces a write before it is attempted', async () => {
    const storage = new MapStorage();
    storage.setItem(SLOT, 'absent');
    const inner = memoryStore();
    const seen: (string | null)[] = [];
    const store = trackReconciliationPresence({
      read: (key) => inner.read(key),
      compareAndSwap: (...args) => { seen.push(storage.getItem(SLOT)); return inner.compareAndSwap(...args); },
    }, storage, SLOT);
    await store.compareAndSwap('scope', null, 'ciphertext', noGuard);
    expect(seen).toEqual(['present']);
  });

  it('announces a committed write again when another tab recorded absent in between', async () => {
    const storage = new MapStorage();
    const inner = memoryStore();
    const store = trackReconciliationPresence({
      read: (key) => inner.read(key),
      compareAndSwap: async (...args) => { storage.setItem(SLOT, 'absent'); return inner.compareAndSwap(...args); },
    }, storage, SLOT);
    expect(await store.compareAndSwap('scope', null, 'ciphertext', noGuard)).toBe(true);
    expect(readPresence(storage, SLOT)).toBe('present');
  });

  it('falls back to clearing the slot, and refuses the write only when it could still read absent', async () => {
    const inner = memoryStore();
    const full = new MapStorage();
    full.setItem(SLOT, 'absent');
    full.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    expect(await trackReconciliationPresence(inner, full, SLOT).compareAndSwap('scope', null, 'first', noGuard)).toBe(true);
    expect(readPresence(full, SLOT)).toBe('unknown');

    const stuck = new MapStorage();
    stuck.setItem(SLOT, 'absent');
    stuck.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    stuck.removeItem = () => { throw new DOMException('denied', 'SecurityError'); };
    const write = vi.spyOn(inner, 'compareAndSwap');
    await expect(trackReconciliationPresence(inner, stuck, SLOT).compareAndSwap('scope', 'first', 'second', noGuard))
      .rejects.toMatchObject({ translation: { key: 'error.reconciliationVault.encryptedReconciliationWriteDidNotCommit' } });
    await expect(trackReconciliationPresence(inner, stuck, SLOT).compareAndSwap('scope', 'first', 'second', noGuard)).rejects.toBeInstanceOf(UserFacingError);
    expect(write).not.toHaveBeenCalled();
    expect(inner.data.get('scope')).toBe('first');

    // Without any browser storage nothing can read `absent` later, so the write goes ahead.
    expect(await trackReconciliationPresence(inner, undefined, SLOT).compareAndSwap('scope', 'first', 'third', noGuard)).toBe(true);
  });

  it('leaves the slot alone when the read itself fails', async () => {
    const storage = new MapStorage();
    const store = trackReconciliationPresence({ read: () => Promise.reject(new Error('IndexedDB failed')), compareAndSwap: vi.fn() }, storage, SLOT);
    await expect(store.read('scope')).rejects.toThrow('IndexedDB failed');
    expect(storage.getItem(SLOT)).toBeNull();
  });
});

describe('current reconciliation presence (LATE-M1)', () => {
  it('reads the slot of the loaded keys only; other keys or a refusing lender are unknown', () => {
    const storage = new MapStorage();
    storage.setItem(SLOT, 'absent');
    const lend = Object.assign(<T>(keyId: string, use: (viewingKey: Uint8Array) => T): T | undefined =>
      keyId === KEY_ID ? use(Uint8Array.from(VIEWING_KEY)) : undefined, {});
    expect(currentReconciliationPresence(84532, KEY_ID, storage, lend)).toBe('absent');
    expect(currentReconciliationPresence(84532, 'b'.repeat(64), storage, lend)).toBe('unknown');
    expect(currentReconciliationPresence(11155111, KEY_ID, storage, lend)).toBe('unknown');
    const refusing = Object.assign((): undefined => { throw new Error('suspended'); }, {});
    expect(currentReconciliationPresence(84532, KEY_ID, storage, refusing)).toBe('unknown');
  });
});
