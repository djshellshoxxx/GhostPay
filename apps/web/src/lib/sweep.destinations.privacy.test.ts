import type { Address } from '@ghostpay/chain-adapters';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAppLock } from './appLock';
import { clearSession, generateSession, getSessionPublic } from './session';
import * as sweep from './sweep';

const DEST = '0x6666666666666666666666666666666666666666' as Address;
const OWNER = '0x1111111111111111111111111111111111111111' as Address;
const OTHER = '0x2222222222222222222222222222222222222222' as Address;
const CHAIN = 84532;

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

beforeEach(() => { generateSession(); });
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

describe('TM7 session-only destination history', () => {
  it('does not persist source/destination linkage and still warns within the current session', () => {
    const store = storage();
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER);
    sweep.recordSweepDestination(store, CHAIN, DEST, OTHER);
    expect(store.setItem).not.toHaveBeenCalled();
    expect(store.getItem).not.toHaveBeenCalled();
    expect(store.values.size).toBe(0);
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([OWNER, OTHER]);
    expect(sweep.destinationWarning(DEST, OTHER, CHAIN, sweep.loadDestLedger(store))).toBe('used');
  });

  it('records in memory when browser storage is unavailable', () => {
    sweep.recordSweepDestination(undefined, CHAIN, DEST, OWNER);
    expect(sweep.destinationWarning(DEST, OTHER, CHAIN, sweep.loadDestLedger(undefined))).toBe('used');
  });

  it('supports legacy storage wrappers that cannot remove the old key without reading or writing them', () => {
    const { getItem, setItem } = storage();
    const wrapper = { getItem, setItem };
    sweep.recordSweepDestination(wrapper, CHAIN, DEST, OWNER);
    expect(sweep.destinationWarning(DEST, OTHER, CHAIN, sweep.loadDestLedger(wrapper))).toBe('used');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('removes only the legacy plaintext key without reading or importing it', () => {
    const store = storage();
    store.values.set(sweep.DEST_LEDGER_KEY, JSON.stringify([{ chainId: CHAIN, destination: DEST, sources: [OWNER] }]));
    store.values.set('unrelated-user-setting', 'preserve');
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
    expect(store.getItem).not.toHaveBeenCalled();
    expect(store.removeItem).toHaveBeenCalledWith(sweep.DEST_LEDGER_KEY);
    expect([...store.values.entries()]).toEqual([['unrelated-user-setting', 'preserve']]);
  });

  it.each(['manual', 'idle'] as const)('clears history on %s lock even when the same unsaved keys remain loaded', (reason) => {
    const store = storage();
    const session = getSessionPublic();
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER);
    notifyAppLock(reason);
    expect(getSessionPublic()).toBe(session);
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
  });

  it('clears history when seller keys change or the session is cleared silently', () => {
    const store = storage();
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER);
    generateSession();
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER);
    clearSession(false);
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
  });

  it('does not let delayed completion repopulate history after lock or session replacement', () => {
    const store = storage();
    const beforeLock = sweep.captureDestinationLedgerGuard();
    notifyAppLock('manual');
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER, beforeLock);
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
    const beforeReplacement = sweep.captureDestinationLedgerGuard();
    generateSession();
    sweep.recordSweepDestination(store, CHAIN, DEST, OWNER, beforeReplacement);
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([]);
    sweep.recordSweepDestination(store, CHAIN, DEST, OTHER, sweep.captureDestinationLedgerGuard());
    expect(sweep.loadDestLedger(store).linkedSources(CHAIN, DEST)).toEqual([OTHER]);
  });

  it('blocked cleanup never breaks the advisory warning or causes storage reads/writes', () => {
    const blocked = {
      removeItem: vi.fn(() => { throw new Error('storage denied'); }),
      getItem: vi.fn(() => { throw new Error('must not read'); }),
      setItem: vi.fn(() => { throw new Error('must not write'); }),
    };
    expect(() => sweep.recordSweepDestination(blocked, CHAIN, DEST, OWNER)).not.toThrow();
    expect(sweep.destinationWarning(DEST, OTHER, CHAIN, sweep.loadDestLedger(blocked))).toBe('used');
    expect(blocked.getItem).not.toHaveBeenCalled();
    expect(blocked.setItem).not.toHaveBeenCalled();
  });

  it('cannot record without a seller session or mutate history through a returned snapshot', () => {
    const snapshot = sweep.loadDestLedger(undefined);
    snapshot.record(CHAIN, DEST, OWNER);
    expect(sweep.loadDestLedger(undefined).linkedSources(CHAIN, DEST)).toEqual([]);
    clearSession();
    sweep.recordSweepDestination(undefined, CHAIN, DEST, OWNER);
    expect(sweep.loadDestLedger(undefined).linkedSources(CHAIN, DEST)).toEqual([]);
  });
});
