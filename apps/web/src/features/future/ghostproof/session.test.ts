import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReceiptImportSession } from './session';
import type { ReceiptReviewOptions } from './review';
import { digestText, options, SIGNED_TEXT } from './fixtures.testutil';

afterEach(() => { vi.restoreAllMocks(); });

function holdDigest(): () => void {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
    await held;
    return original(algorithm, data);
  });
  return release;
}

describe('scoped offline receipt import', () => {
  it('clears a completed review when its caller session locks', async () => {
    const session = createReceiptImportSession();
    const caller = new AbortController();
    expect(session.snapshot()).toEqual({ status: 'idle' });
    const result = await session.importReceipt(SIGNED_TEXT, options({ signal: caller.signal }));
    expect(result.ok).toBe(true);
    expect(session.snapshot()).toMatchObject({ status: 'ready', review: { assurance: 'signed_statement' } });
    caller.abort();
    expect(session.snapshot()).toEqual({ status: 'idle' });
  });

  it('clears immediately on lock and suppresses a later digest result', async () => {
    const text = await digestText();
    const release = holdDigest();
    const session = createReceiptImportSession();
    const caller = new AbortController();
    const pending = session.importReceipt(text, options({ signal: caller.signal }));
    expect(session.snapshot()).toEqual({ status: 'checking' });
    caller.abort();
    expect(session.snapshot()).toEqual({ status: 'idle' });
    release();
    expect(await pending).toEqual({ ok: false, code: 'CANCELLED' });
    expect(session.snapshot()).toEqual({ status: 'idle' });
  });

  it('preserves the latest import when an older operation finishes late', async () => {
    const text = await digestText();
    const release = holdDigest();
    const session = createReceiptImportSession();
    const obsoleteCaller = new AbortController();
    const older = session.importReceipt(text, options({ signal: obsoleteCaller.signal }));
    const newer = await session.importReceipt(SIGNED_TEXT, options());
    expect(newer.ok).toBe(true);
    obsoleteCaller.abort();
    release();
    expect(await older).toEqual({ ok: false, code: 'CANCELLED' });
    expect(session.snapshot()).toMatchObject({ status: 'ready', review: { format: 'signed-receipt-v1' } });
  });

  it('disposes pending work and cannot be reopened', async () => {
    const text = await digestText();
    const release = holdDigest();
    const session = createReceiptImportSession();
    const pending = session.importReceipt(text, options());
    session.dispose();
    expect(session.snapshot()).toEqual({ status: 'disposed' });
    release();
    expect(await pending).toEqual({ ok: false, code: 'CANCELLED' });
    expect(await session.importReceipt(SIGNED_TEXT, options())).toEqual({ ok: false, code: 'DISPOSED' });
    session.clear();
    session.dispose();
    expect(session.snapshot()).toEqual({ status: 'disposed' });
  });

  it('removes session listeners on clear and releases stored disclosure', async () => {
    const session = createReceiptImportSession();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    await session.importReceipt(SIGNED_TEXT, options({ signal: caller.signal }));
    session.clear();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove.mock.calls[0]?.[0]).toBe('abort');
    expect(session.snapshot()).toEqual({ status: 'idle' });
  });

  it('replaces an old review with a fixed error and can recover with a fresh import', async () => {
    const session = createReceiptImportSession();
    await session.importReceipt(SIGNED_TEXT, options());
    expect(await session.importReceipt('private-invalid-marker', options())).toEqual({ ok: false, code: 'MALFORMED' });
    expect(session.snapshot()).toEqual({ status: 'error', code: 'MALFORMED' });
    expect(JSON.stringify(session.snapshot())).not.toContain('private-invalid-marker');
    expect((await session.importReceipt(SIGNED_TEXT, options())).ok).toBe(true);
  });

  it('does not revive a completed review for an already cancelled or malformed caller', async () => {
    const session = createReceiptImportSession();
    await session.importReceipt(SIGNED_TEXT, options());
    const caller = new AbortController();
    caller.abort();
    expect(await session.importReceipt(SIGNED_TEXT, options({ signal: caller.signal }))).toEqual({ ok: false, code: 'CANCELLED' });
    expect(session.snapshot()).toEqual({ status: 'idle' });
    expect(await session.importReceipt(SIGNED_TEXT, undefined as unknown as ReceiptReviewOptions)).toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    expect(session.snapshot()).toEqual({ status: 'error', code: 'INVALID_CONTEXT' });
  });

  it('rejects accessor options before reading them or installing a listener', async () => {
    const session = createReceiptImportSession();
    const getter = vi.fn(() => { throw new Error('private-option-detail'); });
    const invalid = options();
    Object.defineProperty(invalid, 'nowMs', { get: getter });
    expect(await session.importReceipt(SIGNED_TEXT, invalid)).toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    expect(getter).not.toHaveBeenCalled();
    expect(session.snapshot()).toEqual({ status: 'error', code: 'INVALID_CONTEXT' });
    expect((await session.importReceipt(SIGNED_TEXT, options())).ok).toBe(true);
  });

  it('cleans up a failed listener installation without stranding checking state', async () => {
    const session = createReceiptImportSession();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    vi.spyOn(caller.signal, 'addEventListener').mockImplementationOnce(() => { throw new Error('private-listener-detail'); });
    expect(await session.importReceipt(SIGNED_TEXT, options({ signal: caller.signal }))).toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    expect(remove).toHaveBeenCalledOnce();
    expect(session.snapshot()).toEqual({ status: 'error', code: 'INVALID_CONTEXT' });
    expect((await session.importReceipt(SIGNED_TEXT, options())).ok).toBe(true);
  });
});
