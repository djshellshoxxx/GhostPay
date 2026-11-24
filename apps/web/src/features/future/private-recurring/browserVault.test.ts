import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotFixture } from './fixtures.testutil';
import { createCurrentRecurringVault } from './browserVault';

const state = vi.hoisted(() => ({
  key: new Uint8Array(32).fill(29),
  revision: 1,
  available: true,
  spendingPublicKey: `02${'11'.repeat(32)}`,
  viewingPublicKey: `03${'22'.repeat(32)}`,
  revealed: [] as Uint8Array[],
  listeners: new Set<() => void>(),
  records: new Map<string, string>(),
}));

vi.mock('../../../lib/session', () => ({
  captureSessionGuard: () => {
    if (!state.available) throw new Error('no loaded seller session');
    const revision = state.revision;
    return () => {
      if (!state.available || state.revision !== revision)
        throw new Error('seller session changed');
    };
  },
  getSessionPublic: () => state.available ? {
    spendingPublicKey: state.spendingPublicKey,
    viewingPublicKey: state.viewingPublicKey,
  } : undefined,
  revealViewingKey: () => {
    const bytes = Uint8Array.from(state.key);
    state.revealed.push(bytes);
    return bytes;
  },
  subscribeSession: (listener: () => void) => {
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  },
}));

vi.mock('../../../lib/reconciliationVault', () => ({
  IdbReconciliationVaultStore: class {
    public async read(key: string): Promise<string | null> {
      return Promise.resolve(state.records.get(key) ?? null);
    }
    public async compareAndSwap(
      key: string, expected: string | null, next: string, guard: () => void,
    ): Promise<boolean> {
      guard();
      if ((state.records.get(key) ?? null) !== expected) return Promise.resolve(false);
      state.records.set(key, next);
      return Promise.resolve(true);
    }
  },
}));

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  state.key = new Uint8Array(32).fill(29);
  state.revision = 1;
  state.available = true;
  state.spendingPublicKey = `02${'11'.repeat(32)}`;
  state.viewingPublicKey = `03${'22'.repeat(32)}`;
  state.revealed = [];
  state.listeners.clear();
  state.records.clear();
});
afterEach(() => {
  state.listeners.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('F10 M4 browser seller-session key binding', () => {
  it('derives an AES256 key without persisting raw viewing bytes and reopens its encrypted snapshot', async () => {
    const first = await createCurrentRecurringVault();
    const created = await first.vault.commit(null, {
      ...snapshotFixture({ status: 'paused' }), profileRef: first.profileRef,
    });
    expect(created.snapshot.profileRef).toBe(first.profileRef);
    const raw = [...state.records.values()].join('');
    expect(raw).not.toContain('plan-1');
    expect(raw).not.toContain('template-1');
    expect(raw).not.toContain(Buffer.from(new Uint8Array(32).fill(29)).toString('hex'));
    expect(state.revealed).toHaveLength(1);
    expect(state.revealed[0]?.every(byte => byte === 0)).toBe(true);
    first.dispose();

    const second = await createCurrentRecurringVault();
    const loaded = await second.vault.load();
    expect(loaded?.snapshot).toEqual(created.snapshot);
    expect(state.revealed[1]?.every(byte => byte === 0)).toBe(true);
    second.dispose();
  });

  it('immediately revokes the vault when the seller changes and detaches on disposal', async () => {
    const session = await createCurrentRecurringVault();
    expect(state.listeners.size).toBe(1);
    state.revision++;
    for (const callback of state.listeners) callback();
    await expect(session.vault.load()).rejects.toThrow();
    session.dispose();
    expect(state.listeners.size).toBe(0);
    await expect(session.vault.load()).rejects.toThrow();
  });

  it('never opens the same saved record under the wrong viewing key', async () => {
    const first = await createCurrentRecurringVault();
    await first.vault.commit(null, { ...snapshotFixture({ status: 'paused' }), profileRef: first.profileRef });
    first.dispose();

    state.key = new Uint8Array(32).fill(97);
    state.revision++;
    const wrong = await createCurrentRecurringVault();
    await expect(wrong.vault.load()).rejects.toMatchObject({ code: 'CORRUPT' });
    wrong.dispose();
  });

  it('uses distinct scoped state when public seller keys rotate', async () => {
    const first = await createCurrentRecurringVault();
    await first.vault.commit(null, { ...snapshotFixture({ status: 'paused' }), profileRef: first.profileRef });
    first.dispose();

    state.spendingPublicKey = `02${'33'.repeat(32)}`;
    state.revision++;
    const rotated = await createCurrentRecurringVault();
    expect(rotated.profileRef).not.toBe(first.profileRef);
    await expect(rotated.vault.load()).resolves.toBeNull();
    rotated.dispose();
  });

  it('rejects absent seller sessions without copying any private key material', async () => {
    state.available = false;
    await expect(createCurrentRecurringVault()).rejects.toThrow();
    expect(state.revealed).toHaveLength(0);
    expect(state.records.size).toBe(0);
  });
});
