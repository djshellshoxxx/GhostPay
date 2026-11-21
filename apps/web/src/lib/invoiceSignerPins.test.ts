// @vitest-environment jsdom
import { signerPublicKeyHex } from '@ghostpay/invoice-schema';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INVOICE_SIGNER_PINS_KEY,
  changeInvoiceSignerPin,
  createInvoiceSignerPinStore,
  getInvoiceSignerPinsSnapshot,
  refreshInvoiceSignerPins,
  useInvoiceSignerPins,
  type InvoiceSignerPinChangeResult,
  type InvoiceSignerPinLock,
  type InvoiceSignerPinStorage,
} from './invoiceSignerPins';

const ALICE = signerPublicKeyHex(new Uint8Array(32).fill(41));
const BOB = signerPublicKeyHex(new Uint8Array(32).fill(42));
const ROTATED = signerPublicKeyHex(new Uint8Array(32).fill(43));
const add = (label = 'Alice', signer = ALICE) => ({ label, expectedSigner: null, signer, confirmation: signer });

function memoryStorage(): InvoiceSignerPinStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

function originLock(): InvoiceSignerPinLock {
  let held = false;
  return (_name, action) => {
    if (held) return Promise.resolve('unavailable');
    held = true;
    return Promise.resolve().then(action).finally(() => { held = false; });
  };
}

function fixture() {
  const storage = memoryStorage();
  const eventTarget = new EventTarget();
  const lock = originLock();
  return { storage, eventTarget, lock, store: createInvoiceSignerPinStore({ storage: () => storage, lock: () => lock, eventTarget }) };
}

describe('explicit local invoice signer pins', () => {
  it('starts empty and records only an explicitly confirmed full key for the named seller', async () => {
    const { store, storage } = fixture();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', pins: [] });
    expect(await store.change({ ...add(), confirmation: BOB })).toBe('invalid');
    expect(storage.getItem(INVOICE_SIGNER_PINS_KEY)).toBeNull();
    expect(await store.change(add())).toBe('saved');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ALICE }]);
    expect(JSON.parse(storage.getItem(INVOICE_SIGNER_PINS_KEY) ?? '') as unknown).toEqual({
      v: 1, revision: 1, pins: [{ label: 'Alice', signer: ALICE }],
    });
    expect(createInvoiceSignerPinStore({ storage: () => storage }).getSnapshot().pins).toEqual(store.getSnapshot().pins);
  });

  it('never substitutes another saved seller and requires the displayed old key to replace or remove a pin', async () => {
    const { store } = fixture();
    await store.change(add());
    await store.change(add('Bob', BOB));
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ALICE }, { label: 'Bob', signer: BOB }]);
    expect(await store.change(add('Alice', ROTATED))).toBe('conflict');
    expect(await store.change({ ...add('Alice', ROTATED), expectedSigner: BOB })).toBe('conflict');
    expect(await store.change({ ...add('Alice', ROTATED), expectedSigner: ALICE, confirmation: ALICE })).toBe('invalid');
    expect(await store.change({ ...add('Alice', ROTATED), expectedSigner: ALICE })).toBe('saved');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ROTATED }, { label: 'Bob', signer: BOB }]);
    expect(await store.change({ label: 'Alice', expectedSigner: ALICE, signer: null, confirmation: ALICE })).toBe('conflict');
    expect(await store.change({ label: 'Alice', expectedSigner: ROTATED, signer: null, confirmation: ROTATED })).toBe('removed');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Bob', signer: BOB }]);
    expect(await store.change({ label: 'Alice', expectedSigner: ROTATED, signer: null, confirmation: ROTATED })).toBe('conflict');
  });

  it('retains a monotonic persisted revision when removing every pin and readding the same identity', async () => {
    const { store, storage } = fixture();
    await store.change(add());
    const before = store.getSnapshot();
    await store.change({ label: 'Alice', expectedSigner: ALICE, signer: null, confirmation: ALICE });
    await store.change(add());
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(JSON.parse(storage.getItem(INVOICE_SIGNER_PINS_KEY) ?? '') as unknown).toMatchObject({ revision: 3 });
  });

  it.each(['', ' ', 'x'.repeat(65), 'Alice\u202e', 'Alice\u0000', 'Alice\nBob', '\ud800'])('rejects ambiguous or invalid local labels: %j', async (label) => {
    const { store } = fixture();
    expect(await store.change(add(label))).toBe('invalid');
    expect(store.getSnapshot().pins).toEqual([]);
  });

  it.each(['ab', `0x${ALICE}`, ALICE.toUpperCase(), `04${'01'.repeat(64)}`, `02${'ff'.repeat(32)}`, `02${'cd'.repeat(32)}`])('refuses unsupported, noncanonical or off-curve public keys: %s', async (signer) => {
    const { store } = fixture();
    expect(await store.change(add('Alice', signer))).toBe('invalid');
  });

  it('normalizes user-entered label whitespace and NFC without making the invoice a trust source', async () => {
    const { store } = fixture();
    expect(await store.change(add('  Cafe\u0301  '))).toBe('saved');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Café', signer: ALICE }]);
    expect(await store.change(add('Café', BOB))).toBe('conflict');
  });

  it('limits the number of saved identities while still allowing explicit replacement and removal at capacity', async () => {
    const { store } = fixture();
    for (let i = 0; i < 50; i++) expect(await store.change(add(`Seller ${i}`))).toBe('saved');
    expect(await store.change(add('Seller 50'))).toBe('invalid');
    expect(await store.change({ ...add('Seller 0', ROTATED), expectedSigner: ALICE })).toBe('saved');
    expect(await store.change({ label: 'Seller 0', expectedSigner: ROTATED, signer: null, confirmation: ROTATED })).toBe('removed');
    expect(await store.change(add('Seller 50'))).toBe('saved');
  });
});

describe('pin persistence and concurrent changes fail closed', () => {
  it.each([
    '{', '[]', 'null', '{"v":2,"revision":0,"pins":[]}',
    '{"v":1,"v":1,"revision":0,"pins":[]}',
    '{"v":1,"revision":-1,"pins":[]}',
    '{"v":1,"revision":0,"pins":[],"extra":true}',
    JSON.stringify({ v: 1, revision: 0, pins: [{ label: 'Alice', signer: ALICE, privateKey: 'not allowed' }] }),
    JSON.stringify({ v: 1, revision: 0, pins: [{ label: 'Alice', signer: `02${'ff'.repeat(32)}` }] }),
    JSON.stringify({ v: 1, revision: 0, pins: [{ label: 'Alice', signer: ALICE }, { label: 'Alice', signer: BOB }] }),
    JSON.stringify({ v: 1, revision: 0, pins: [{ label: ' Alice ', signer: ALICE }] }),
    JSON.stringify({ v: 1, revision: Number.MAX_SAFE_INTEGER, pins: [] }),
    'x'.repeat(16_385),
  ])('rejects malformed or unsupported stored pins instead of erasing or trusting them', async (text) => {
    const { store, storage } = fixture();
    storage.setItem(INVOICE_SIGNER_PINS_KEY, text);
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', pins: [] });
    expect(await store.change(add())).toBe('unavailable');
    expect(storage.getItem(INVOICE_SIGNER_PINS_KEY)).toBe(text);
  });

  it('reports blocked storage, blocked locking, failed reads and failed or dropped writes explicitly', async () => {
    const none = createInvoiceSignerPinStore({ storage: () => undefined });
    expect(none.getSnapshot().status).toBe('unavailable');
    expect(await none.change(add())).toBe('unavailable');
    const { storage } = fixture();
    const noLock = createInvoiceSignerPinStore({ storage: () => storage, lock: () => undefined });
    expect(await noLock.change(add())).toBe('unavailable');
    expect(noLock.getSnapshot().pins).toEqual([]);
    const failedRead = { getItem: () => { throw new Error('secret failure text'); }, setItem: vi.fn() };
    const readStore = createInvoiceSignerPinStore({ storage: () => failedRead, lock: () => originLock() });
    expect(readStore.getSnapshot()).toMatchObject({ status: 'unavailable', pins: [] });
    expect(await readStore.change(add())).toBe('unavailable');
    expect(failedRead.setItem).not.toHaveBeenCalled();
    for (const setItem of [() => { throw new Error('write failed'); }, () => undefined]) {
      const writeStore = createInvoiceSignerPinStore({ storage: () => ({ getItem: () => null, setItem }), lock: () => originLock() });
      expect(await writeStore.change(add())).toBe('unavailable');
      expect(writeStore.getSnapshot().pins).toEqual([]);
    }
  });

  it('serializes writers and rejects a concurrent creation rather than silently replacing it', async () => {
    const { storage, lock } = fixture();
    const a = createInvoiceSignerPinStore({ storage: () => storage, lock: () => lock });
    const b = createInvoiceSignerPinStore({ storage: () => storage, lock: () => lock });
    const outcomes = await Promise.all([a.change(add()), b.change(add('Alice', BOB))]);
    expect(outcomes).toEqual(['saved', 'unavailable']);
    expect(a.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ALICE }]);
    expect(b.getSnapshot().pins).toEqual(a.getSnapshot().pins);
    expect(await b.change(add('Alice', BOB))).toBe('conflict');
  });

  it('rechecks the current invoice/session and displayed key inside a delayed write lock', async () => {
    const { storage, store } = fixture();
    await store.change(add());
    let run: (() => void) | undefined;
    const delayed: InvoiceSignerPinLock = (_name, action) => new Promise((resolve) => { run = () => { resolve(action()); }; });
    const other = createInvoiceSignerPinStore({ storage: () => storage, lock: () => delayed });
    let current = true;
    const pending = other.change({ ...add('Alice', BOB), expectedSigner: ALICE }, () => current);
    current = false;
    run?.();
    expect(await pending).toBe('conflict');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ALICE }]);
    current = true;
    const staleKey = other.change({ ...add('Alice', BOB), expectedSigner: ALICE }, () => current);
    await store.change({ ...add('Alice', ROTATED), expectedSigner: ALICE });
    run?.();
    expect(await staleKey).toBe('conflict');
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: ROTATED }]);
  });

  it('notifies local subscribers after changes and returns stable snapshots until the underlying value changes', async () => {
    const { store } = fixture();
    const first = store.getSnapshot();
    const notify = vi.fn();
    const stop = store.subscribe(notify);
    expect(store.getSnapshot()).toBe(first);
    await store.change(add());
    const saved = store.getSnapshot();
    expect(saved).not.toBe(first);
    expect(store.getSnapshot()).toBe(saved);
    expect(notify).toHaveBeenCalledTimes(1);
    await store.change({ ...add(), confirmation: BOB });
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
    await store.change(add('Bob', BOB));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rereads actual storage on external events, ignores forged event values, and refreshes after focus', async () => {
    const { store, storage, eventTarget } = fixture();
    const notify = vi.fn();
    const stop = store.subscribe(notify);
    await store.change(add());
    const saved = store.getSnapshot();
    eventTarget.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY, newValue: JSON.stringify({ v: 1, revision: 2, pins: [{ label: 'Alice', signer: BOB }] }) }));
    expect(store.getSnapshot()).toBe(saved);
    expect(notify).toHaveBeenCalledTimes(1);
    storage.setItem(INVOICE_SIGNER_PINS_KEY, JSON.stringify({ v: 1, revision: 2, pins: [{ label: 'Alice', signer: BOB }] }));
    eventTarget.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(notify).toHaveBeenCalledTimes(1);
    eventTarget.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY }));
    expect(store.getSnapshot().pins).toEqual([{ label: 'Alice', signer: BOB }]);
    expect(notify).toHaveBeenCalledTimes(2);
    storage.setItem(INVOICE_SIGNER_PINS_KEY, 'corrupt');
    eventTarget.dispatchEvent(new Event('focus'));
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', pins: [] });
    expect(notify).toHaveBeenCalledTimes(3);
    stop();
    storage.setItem(INVOICE_SIGNER_PINS_KEY, '{"v":1,"revision":3,"pins":[]}');
    eventTarget.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('still notifies the view when a pending authority guard read a new key before its storage event', async () => {
    const { store, storage, eventTarget } = fixture();
    await store.change(add());
    const notify = vi.fn();
    const stop = store.subscribe(notify);
    const prior = store.getSnapshot();
    storage.setItem(INVOICE_SIGNER_PINS_KEY, JSON.stringify({ v: 1, revision: 2, pins: [{ label: 'Alice', signer: BOB }] }));
    // Async verification must refuse the old pin even before the queued native storage event is delivered.
    expect(store.getSnapshot()).not.toBe(prior);
    expect(notify).not.toHaveBeenCalled();
    eventTarget.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY }));
    expect(notify).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('browser pin store subscription', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    refreshInvoiceSignerPins();
  });

  function locks(): void {
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: unknown, action: (lock: Lock | null) => InvoiceSignerPinChangeResult) =>
          Promise.resolve(action({ name: INVOICE_SIGNER_PINS_KEY, mode: 'exclusive' })),
      },
    });
  }

  it('updates the hook after explicit save, persists across remount, and reacts to cross-tab clearing', async () => {
    window.localStorage.clear();
    locks();
    const mounted = renderHook(() => useInvoiceSignerPins());
    expect(mounted.result.current).toMatchObject({ status: 'ready', pins: [] });
    await act(async () => { expect(await changeInvoiceSignerPin(add())).toBe('saved'); });
    expect(mounted.result.current.pins).toEqual([{ label: 'Alice', signer: ALICE }]);
    expect(getInvoiceSignerPinsSnapshot()).toBe(mounted.result.current);
    mounted.unmount();
    const reopened = renderHook(() => useInvoiceSignerPins());
    expect(reopened.result.current.pins).toEqual([{ label: 'Alice', signer: ALICE }]);
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage }));
    });
    expect(reopened.result.current).toMatchObject({ status: 'ready', pins: [] });
  });

  it('ignores another storage area and uses the saved bytes when a delayed event arrives', async () => {
    window.localStorage.clear();
    locks();
    const mounted = renderHook(() => useInvoiceSignerPins());
    await act(async () => { await changeInvoiceSignerPin(add()); });
    const prior = mounted.result.current;
    window.localStorage.setItem(INVOICE_SIGNER_PINS_KEY, JSON.stringify({ v: 1, revision: 2, pins: [{ label: 'Alice', signer: BOB }] }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY, storageArea: window.sessionStorage })); });
    expect(mounted.result.current).toBe(prior);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: INVOICE_SIGNER_PINS_KEY, storageArea: window.localStorage, newValue: 'ignored' })); });
    expect(mounted.result.current.pins).toEqual([{ label: 'Alice', signer: BOB }]);
  });

  it('reports inaccessible browser storage and unavailable locks without exposing caught details', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('private diagnostics'); } });
    vi.stubGlobal('navigator', { locks: undefined });
    const mounted = renderHook(() => useInvoiceSignerPins());
    expect(mounted.result.current).toMatchObject({ status: 'unavailable', pins: [] });
    expect(await changeInvoiceSignerPin(add())).toBe('unavailable');
    expect(JSON.stringify(mounted.result.current)).not.toContain('private diagnostics');
  });

  it('refuses a contended origin lock without writing a pin', async () => {
    window.localStorage.clear();
    vi.stubGlobal('navigator', { locks: { request: (_name: string, _options: unknown, action: (lock: Lock | null) => InvoiceSignerPinChangeResult) => Promise.resolve(action(null)) } });
    expect(await changeInvoiceSignerPin(add())).toBe('unavailable');
    expect(getInvoiceSignerPinsSnapshot()).toMatchObject({ status: 'ready', pins: [] });
  });
});
