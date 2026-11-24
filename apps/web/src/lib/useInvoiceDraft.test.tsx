// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as codec from './invoiceDraft';
import { clearSession } from './session';
import { generateWaivedSession } from '../test/keys';
import { useInvoiceDraft } from './useInvoiceDraft';

beforeEach(() => { clearSession(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

it('commits only the latest edit and cannot resurrect a removed draft', async () => {
  const session = generateWaivedSession();
  const pending: ((sealed: string) => void)[] = [];
  vi.spyOn(codec, 'sealDraft').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const { result } = renderHook(() => useInvoiceDraft(session, 84532));
  const slot = codec.draftSlot(session);
  act(() => { result.current.change({ memo: 'private unsaved memo' }); });
  expect(pending).toHaveLength(0);
  act(() => { result.current.save(); result.current.change({ memo: 'edited privately' }); });
  await act(async () => { pending[1]!('newer ciphertext'); await Promise.resolve(); });
  await act(async () => { pending[0]!('older ciphertext'); await Promise.resolve(); });
  expect(sessionStorage.getItem(slot)).toBe('newer ciphertext');
  act(() => { result.current.change({ memo: 'last edit' }); result.current.remove(); });
  await act(async () => { pending[2]!('late ciphertext'); await Promise.resolve(); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  expect(result.current.draft.memo).toBe('last edit');
});

it('retains the prior checkpoint on save failure and lets a retry commit', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532));
  act(() => { result.current.save(); });
  await waitFor(() => expect(result.current.status).toBe('saved'));
  const prior = sessionStorage.getItem(slot);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
  act(() => { result.current.change({ tokenAmount: '1.25' }); });
  await waitFor(() => expect(result.current.status).toBe('saveFailed'));
  expect(sessionStorage.getItem(slot)).toBe(prior);
  expect(result.current.draft.tokenAmount).toBe('1.25');
  act(() => { result.current.change({ memo: 'retry' }); });
  await waitFor(() => expect(result.current.status).toBe('saved'));
  expect(await codec.openDraft(slot, sessionStorage.getItem(slot)!)).toMatchObject({ tokenAmount: '1.25', memo: 'retry' });
});

it('preserves damaged ciphertext until explicitly removed and rejects the wrong seller', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const raw = await codec.sealDraft(slot, codec.blankDraft(84532));
  const damaged = raw.slice(0, 35) + (raw[35] === 'A' ? 'B' : 'A') + raw.slice(36);
  sessionStorage.setItem(slot, damaged);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532));
  act(() => { result.current.resume(); });
  await waitFor(() => expect(result.current.status).toBe('openFailed'));
  expect(sessionStorage.getItem(slot)).toBe(damaged);
  act(() => { result.current.remove(); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  generateWaivedSession();
  await expect(codec.openDraft(slot, raw)).rejects.toThrow();
});
