import { describe, expect, it, vi } from 'vitest';
import { InvoicePreviewRetention, RETENTION_KEY, PROOF_RETENTION_KEY, invoicePreviewRetention, proofPreviewRetention, readRetentionDelay, writeRetentionDelay } from './metadataRetention';

describe('nonessential invoice presentation retention', () => {
  it('requires the exact preview, rejects stale previews and cannot replay approval', () => {
    const store = new InvoicePreviewRetention();
    const first = vi.fn();
    store.register(first, 1_000);
    const stale = store.preview();
    const second = vi.fn();
    store.register(second, 1_001);
    expect(store.confirm(stale)).toEqual({ kind: 'stale' });
    expect(first).not.toHaveBeenCalled();
    const current = store.preview();
    expect(store.confirm({ ...current })).toEqual({ kind: 'stale' });
    expect(store.confirm(current)).toEqual({ kind: 'cleared', count: 2, failed: 0 });
    expect(store.confirm(current)).toEqual({ kind: 'stale' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('expires only registered presentation callbacks, with opt-in and exact age boundaries', () => {
    const store = new InvoicePreviewRetention();
    const clear = vi.fn();
    store.register(clear, 1_000);
    expect(store.expire(0, 999_999)).toBe(0);
    expect(store.expire(300_000, 300_999)).toBe(0);
    expect(store.expire(300_000, 301_000)).toBe(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(store.expire(300_000, 301_001)).toBe(0);
  });

  it('does not expire on invalid clocks, rollback, unsupported policy or disposed ownership', () => {
    const store = new InvoicePreviewRetention();
    const clear = vi.fn();
    const dispose = store.register(clear, 1_000);
    for (const now of [NaN, Infinity, -1, 999]) expect(store.expire(300_000, now)).toBe(0);
    expect(store.expire(1 as never, 999_999)).toBe(0);
    dispose(); dispose();
    expect(store.expire(300_000, 999_999)).toBe(0);
    expect(clear).not.toHaveBeenCalled();
    expect(() => store.register(clear, NaN)).toThrow('Invalid retention registration.');
  });

  it('preserves registrations on failed cleanup and excludes reentrant replacements from approval', () => {
    const store = new InvoicePreviewRetention();
    const replacement = vi.fn();
    store.register(() => { store.register(replacement, 1_000); }, 1_000);
    store.register(() => { throw new Error('neutral test failure'); }, 1_000);
    expect(store.confirm(store.preview())).toEqual({ kind: 'cleared', count: 1, failed: 1 });
    expect(replacement).not.toHaveBeenCalled();
    expect(store.preview().count).toBe(2);
  });

  it('isolates failed observers so registration remains disposable and cleanup can finish', () => {
    const store = new InvoicePreviewRetention();
    const listener = vi.fn();
    store.subscribe(() => { throw new Error('observer unavailable'); });
    store.subscribe(listener);
    const clear = vi.fn();
    let dispose: (() => void) | undefined;
    expect(() => { dispose = store.register(clear, 1_000); }).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.confirm(store.preview())).toEqual({ kind: 'cleared', count: 1, failed: 0 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(() => { dispose?.(); }).not.toThrow();
    expect(store.preview().count).toBe(0);
  });

  it('does not resurrect a failed adapter after its owner disposes during cleanup', () => {
    const store = new InvoicePreviewRetention();
    let dispose: () => void = () => { throw new Error('registration not ready'); };
    const clear = vi.fn(() => {
      dispose();
      throw new Error('view closed during cleanup');
    });
    dispose = store.register(clear, 1_000);
    expect(store.confirm(store.preview())).toEqual({ kind: 'cleared', count: 0, failed: 1 });
    expect(store.preview().count).toBe(0);
    expect(store.expire(300_000, 301_000)).toBe(0);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps the registration bound when a reentrant adapter fills capacity then fails', () => {
    const store = new InvoicePreviewRetention();
    const replacement = vi.fn();
    store.register(() => {
      for (let i = 0; i < 32; i++) store.register(replacement, 1_000);
      throw new Error('view could not clear');
    }, 1_000);
    expect(store.confirm(store.preview())).toEqual({ kind: 'cleared', count: 0, failed: 1 });
    expect(store.preview().count).toBe(32);
    expect(() => store.register(replacement, 1_000)).toThrow('Retention capacity reached.');
    expect(replacement).not.toHaveBeenCalled();
  });

  it('bounds registrations without evicting existing ownership', () => {
    const store = new InvoicePreviewRetention();
    const clear = vi.fn();
    for (let i = 0; i < 32; i++) store.register(clear, i);
    expect(() => store.register(clear, 33)).toThrow('Retention capacity reached.');
    expect(clear).not.toHaveBeenCalled();
    expect(store.preview().count).toBe(32);
  });
});

describe('nonsecret retention preference', () => {
  it('keeps proof consent and manual authority separate from the invoice policy', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(writeRetentionDelay(300_000, storage)).toBe(true);
    expect(readRetentionDelay(storage, 'proof')).toBe(0);
    expect(writeRetentionDelay(900_000, storage, 'proof')).toBe(true);
    expect(readRetentionDelay(storage)).toBe(300_000);
    expect(readRetentionDelay(storage, 'proof')).toBe(900_000);
    expect([...values.keys()]).toEqual([RETENTION_KEY, PROOF_RETENTION_KEY]);
    const clearInvoice = vi.fn();
    const clearProof = vi.fn();
    const disposeInvoice = invoicePreviewRetention.register(clearInvoice);
    const disposeProof = proofPreviewRetention.register(clearProof);
    try {
      const invoicePlan = invoicePreviewRetention.preview();
      expect(proofPreviewRetention.confirm(invoicePlan)).toEqual({ kind: 'stale' });
      expect(proofPreviewRetention.confirm(proofPreviewRetention.preview())).toEqual({ kind: 'cleared', count: 1, failed: 0 });
      expect(clearProof).toHaveBeenCalledOnce();
      expect(clearInvoice).not.toHaveBeenCalled();
      expect(invoicePreviewRetention.confirm(invoicePlan)).toEqual({ kind: 'cleared', count: 1, failed: 0 });
    } finally { disposeInvoice(); disposeProof(); }
  });

  it('accepts only supported delays and touches only its dedicated preference key', () => {
    const values = new Map<string, string>([['vault', 'keep'], ['pending', 'keep']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readRetentionDelay(storage)).toBe(0);
    expect(writeRetentionDelay(300_000, storage)).toBe(true);
    expect(readRetentionDelay(storage)).toBe(300_000);
    expect(writeRetentionDelay(1 as never, storage)).toBe(false);
    expect(values.get('vault')).toBe('keep');
    expect(values.get('pending')).toBe('keep');
    values.set(RETENTION_KEY, '{"delay":300000,"unexpected":true}');
    expect(readRetentionDelay(storage)).toBe(0);
    values.set(RETENTION_KEY, '300000');
    expect(readRetentionDelay(storage)).toBe(0);
  });

  it.each([
    ['duplicate delay', '{"delay":0,"delay":300000}'],
    ['oversized preference', `${' '.repeat(128)}{"delay":300000}`],
  ])('does not enable automatic cleanup from %s', (_kind, raw) => {
    expect(readRetentionDelay({ getItem: () => raw })).toBe(0);
  });

  it('handles denied or malformed storage without changing the policy or propagating input', () => {
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readRetentionDelay(denied)).toBe(0);
    expect(writeRetentionDelay(900_000, denied)).toBe(false);
    expect(readRetentionDelay({ getItem: () => '{' })).toBe(0);
  });
});
