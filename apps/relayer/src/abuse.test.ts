import { describe, expect, it } from 'vitest';
import { FailureBudgets } from './abuse.js';
import { KeyHasher } from './limiter.js';

describe('FailureBudgets', () => {
  it('charges both owner and destination and expires strikes at the window boundary', () => {
    let now = 0;
    const hasher = new KeyHasher(10_000, () => now, (n) => Buffer.alloc(n, 1));
    const budgets = new FailureBudgets({ ownerMax: 1, destinationMax: 2, windowMs: 1_000, maxKeys: 8 }, hasher, () => now);

    expect(budgets.check('owner-a', 'dest-a')).toEqual({ ok: true });
    budgets.record('owner-a', 'dest-a');
    expect(budgets.check('owner-a', 'dest-b')).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(budgets.check('owner-b', 'dest-a')).toEqual({ ok: true });
    budgets.record('owner-b', 'dest-a');
    expect(budgets.check('owner-b', 'dest-a')).toEqual({ ok: false, retryAfterSeconds: 1 });

    now = 1_000;
    expect(budgets.check('owner-a', 'dest-a')).toEqual({ ok: true });
  });

  it('bounds owner and destination keys with LRU eviction', () => {
    const now = 0;
    const hasher = new KeyHasher(10_000, () => now, (n) => Buffer.alloc(n, 2));
    const budgets = new FailureBudgets({ ownerMax: 1, destinationMax: 1, windowMs: 1_000, maxKeys: 1 }, hasher, () => now);
    budgets.record('owner-a', 'dest-a');
    budgets.record('owner-b', 'dest-b'); // evicts both older hashed keys
    expect(budgets.check('owner-b', 'dest-b')).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(budgets.check('owner-a', 'dest-a')).toEqual({ ok: true });
  });

  it('drops hashed failure history when the key salt rotates', () => {
    let now = 0;
    let salt = 1;
    const hasher = new KeyHasher(100, () => now, (n) => Buffer.alloc(n, salt++));
    const budgets = new FailureBudgets({ ownerMax: 1, destinationMax: 1, windowMs: 10_000, maxKeys: 8 }, hasher, () => now);
    budgets.record('owner-a', 'dest-a');
    expect(budgets.check('owner-a', 'dest-a').ok).toBe(false);
    now = 100;
    hasher.refresh();
    expect(budgets.check('owner-a', 'dest-a')).toEqual({ ok: true });
  });
});
