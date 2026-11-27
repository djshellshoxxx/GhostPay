// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkpointKeyId } from '@ghostpay/ux-vault/portable';
import * as codec from './invoiceDraft';
import { clearSession, suspendSession } from './session';
import { generateWaivedSession } from '../test/keys';
import { useInvoiceDraft } from './useInvoiceDraft';
import { tokenChoices } from './invoiceCreate';

const CHAINS = [84532];
const USDC = tokenChoices(84532)[1]!.value;
const FULL = { supportedOnly: false, quoteAvailable: (): boolean => true };
const LEAN = { supportedOnly: true, quoteAvailable: (): boolean => true };
const NO_FEED = { supportedOnly: false, quoteAvailable: (): boolean => false };

beforeEach(() => { clearSession(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

it('commits only the latest edit and cannot resurrect a removed draft', async () => {
  const session = generateWaivedSession();
  const pending: ((sealed: string) => void)[] = [];
  vi.spyOn(codec, 'sealDraft').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
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
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  const prior = sessionStorage.getItem(slot);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
  act(() => { result.current.change({ tokenAmount: '1.25' }); });
  await waitFor(() => { expect(result.current.status).toBe('saveFailed'); });
  expect(sessionStorage.getItem(slot)).toBe(prior);
  expect(result.current.draft.tokenAmount).toBe('1.25');
  act(() => { result.current.change({ memo: 'retry' }); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  expect(await codec.openDraft(slot, sessionStorage.getItem(slot)!)).toMatchObject({ tokenAmount: '1.25', memo: 'retry' });
});

it('preserves damaged ciphertext until explicitly removed and rejects the wrong seller', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const raw = await codec.sealDraft(slot, codec.blankDraft(84532));
  const damaged = raw.slice(0, 35) + (raw[35] === 'A' ? 'B' : 'A') + raw.slice(36);
  sessionStorage.setItem(slot, damaged);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  await waitFor(() => { expect(result.current.status).toBe('available'); });
  act(() => { result.current.resume(); });
  await waitFor(() => { expect(result.current.status).toBe('openFailed'); });
  expect(sessionStorage.getItem(slot)).toBe(damaged);
  act(() => { result.current.remove(); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  generateWaivedSession();
  await expect(codec.openDraft(slot, raw)).rejects.toThrow();
});

it('refuses to restore money terms the form would change, keeping the saved record', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const range = { token: USDC, bufferMode: 'range', bufferMin: '10', bufferMax: '20' } as const;
  for (const [form, terms] of [
    [LEAN, { amountMode: 'fiat_quote' }], [LEAN, range], [LEAN, { token: USDC, bufferMode: 'declined' }],
    // The full profile: the price feed is gone, or a buffer was left behind on the native coin.
    [NO_FEED, { token: USDC, amountMode: 'fiat_quote' }], [FULL, { bufferMode: 'declined' }],
  ] as const) {
    const raw = await codec.sealDraft(slot, { ...codec.blankDraft(84532), tokenAmount: '2', ...terms });
    sessionStorage.setItem(slot, raw);
    const { result, unmount } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, form));
    await waitFor(() => { expect(result.current.status).toBe('available'); });
    act(() => { result.current.resume(); });
    await waitFor(() => { expect(result.current.status).toBe('openFailed'); });
    expect(result.current.draft).toEqual(codec.blankDraft(84532));
    expect(sessionStorage.getItem(slot)).toBe(raw);
    unmount();
  }
});

it('restores a full-profile fiat and buffer draft unchanged when the form shows those terms', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const full = {
    ...codec.blankDraft(84532), token: USDC, amountMode: 'fiat_quote', quoteMinutes: 90, slippage: 300,
    bufferMode: 'range', bufferMin: '10', bufferMax: '20',
  } as const;
  sessionStorage.setItem(slot, await codec.sealDraft(slot, full));
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  await waitFor(() => { expect(result.current.status).toBe('available'); });
  act(() => { result.current.resume(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  expect(result.current.draft).toEqual(full);
});

it('restores a fixed-token draft in lean with its visible quote terms and never writes full-only fields', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const fixed = { ...codec.blankDraft(84532), quoteMinutes: 90, slippage: 300, token: USDC, tokenAmount: '2' };
  sessionStorage.setItem(slot, await codec.sealDraft(slot, fixed));
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, LEAN));
  await waitFor(() => { expect(result.current.status).toBe('available'); });
  act(() => { result.current.resume(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  expect(result.current.draft).toEqual(fixed);
  // A lean form also never writes those fields, even when its in-memory state still holds them.
  act(() => { result.current.change({ amountMode: 'fiat_quote', bufferMode: 'declined' }); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  expect(await codec.openDraft(slot, sessionStorage.getItem(slot)!)).toMatchObject({ amountMode: 'fixed_token', bufferMode: 'off' });
});

it('keeps no memo or line descriptions for a minimal-metadata draft', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => {
    result.current.change({ memo: 'private memo', items: [{ description: 'private line', quantity: '2', unitPrice: '3' }] });
    result.current.change({ minimalMetadata: true });
    result.current.save();
  });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  const raw = sessionStorage.getItem(slot)!;
  expect(await codec.openDraft(slot, raw)).toMatchObject({
    minimalMetadata: true, memo: '', items: [{ description: '', quantity: '2', unitPrice: '3' }],
  });
  // The open form keeps its in-memory values, as the form does without a draft.
  expect(result.current.draft.memo).toBe('private memo');
});

it('drops the saved copy after creation only when the form did not change meanwhile', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  const submitted = result.current.draft;
  act(() => { result.current.change({ memo: 'typed after submit' }); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  act(() => { result.current.finish(submitted); });
  expect(sessionStorage.getItem(slot)).not.toBeNull();
  act(() => { result.current.finish(result.current.draft); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  expect(result.current.status).toBe('off');
});

it('refuses a draft for a chain or token this build does not offer, keeping the record', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  for (const draft of [
    { ...codec.blankDraft(11155111), tokenAmount: '100' },
    { ...codec.blankDraft(84532), token: `0x${'a'.repeat(40)}`, tokenAmount: '100' },
  ]) {
    const raw = await codec.sealDraft(slot, draft);
    sessionStorage.setItem(slot, raw);
    const { result, unmount } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
    await waitFor(() => { expect(result.current.status).toBe('available'); });
    act(() => { result.current.resume(); });
    await waitFor(() => { expect(result.current.status).toBe('openFailed'); });
    expect(result.current.draft).toEqual(codec.blankDraft(84532));
    expect(sessionStorage.getItem(slot)).toBe(raw);
    unmount();
  }
});

it('ignores and deletes a legacy v2 slot named from the public keys instead of offering it', async () => {
  const session = generateWaivedSession();
  const legacy = `ghostpay.invoice-draft.v2.${checkpointKeyId(session.metaAddress, session.signerPublicKey)}`;
  sessionStorage.setItem(legacy, `${'a'.repeat(32)}.AAAA`);
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  await waitFor(() => { expect(sessionStorage.getItem(legacy)).toBeNull(); });
  expect(result.current.status).toBe('off');
  // The current record is unaffected by that sweep, and a legacy record is never read or migrated.
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  expect(sessionStorage.getItem(codec.draftSlot(session))).not.toBeNull();
  expect(sessionStorage.getItem(legacy)).toBeNull();
});

it('reports no readable draft, without throwing, while the seller keys are suspended', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const raw = await codec.sealDraft(slot, codec.blankDraft(84532));
  sessionStorage.setItem(slot, raw);
  suspendSession();
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.status).toBe('off');
  // The ciphertext is kept: it is the seller's until they remove it, but nothing can name or open it without the keys.
  expect(sessionStorage.getItem(slot)).toBe(raw);
});

it('does not offer a draft when the keys are suspended while a write from a left view was still in flight', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const pending: ((sealed: string) => void)[] = [];
  vi.spyOn(codec, 'sealDraft').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const first = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { first.result.current.save(); });
  first.unmount();
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  expect(result.current.status).toBe('opening');
  suspendSession();
  await act(async () => { pending[0]!('late ciphertext'); await Promise.resolve(); await Promise.resolve(); });
  expect(sessionStorage.getItem(slot)).toBe('late ciphertext');
  expect(result.current.status).toBe('off');
});

// Commit boundary (review of the Phase C repair). The codec checks the session before it returns ciphertext, but the hook
// stores it in a later promise reaction. A clear in between must not bring the removed draft back.
it('does not recreate a draft that an explicit clear removed between the codec session check and the commit', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const real = codec.sealDraft;
  vi.spyOn(codec, 'sealDraft').mockImplementation(async (s, draft) => {
    const raw = await real(s, draft); // the codec's own session check has passed here
    clearSession(true); // purges every draft and the keys, before the hook's write continuation runs
    return raw;
  });
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('off'); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  expect(sessionStorage.length).toBe(0);
  act(() => { result.current.change({ memo: 'typed after the clear' }); });
  expect(codec.sealDraft).toHaveBeenCalledTimes(1); // the clear ended the opt-in: no further write starts
});

it('stores nothing and ends the opt-in when the keys are cleared while the seal is still pending', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const pending: ((sealed: string) => void)[] = [];
  vi.spyOn(codec, 'sealDraft').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  act(() => { clearSession(true); });
  await act(async () => { pending[0]!('ciphertext sealed before the clear'); await Promise.resolve(); await Promise.resolve(); });
  expect(sessionStorage.getItem(slot)).toBeNull();
  expect(result.current.status).toBe('off');
});

it('reports off, not a failed save, when the clear makes the codec refuse the write', async () => {
  const session = generateWaivedSession();
  const real = codec.sealDraft;
  vi.spyOn(codec, 'sealDraft').mockImplementation(async (s, draft) => {
    clearSession(true); // keys gone before the codec's check: it throws
    return real(s, draft);
  });
  const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('off'); });
  expect(sessionStorage.length).toBe(0);
});

it('replacing the keys between the codec check and the commit never writes into the new seller\'s slot', async () => {
  const first = generateWaivedSession();
  const firstSlot = codec.draftSlot(first);
  const real = codec.sealDraft;
  let second: ReturnType<typeof generateWaivedSession> | undefined;
  vi.spyOn(codec, 'sealDraft').mockImplementation(async (s, draft) => {
    const raw = await real(s, draft);
    second = generateWaivedSession(); // another seller replaces the loaded keys (no explicit clear)
    return raw;
  });
  const { result } = renderHook(() => useInvoiceDraft(first, 84532, CHAINS, FULL));
  act(() => { result.current.save(); });
  await waitFor(() => { expect(result.current.status).toBe('saved'); });
  const secondSlot = codec.draftSlot(second!);
  expect(secondSlot).not.toBe(firstSlot);
  expect(sessionStorage.getItem(secondSlot)).toBeNull();
  // The record is the first seller's ciphertext under the first seller's slot: the new keys cannot open it.
  await expect(codec.openDraft(firstSlot, sessionStorage.getItem(firstSlot)!)).rejects.toThrow();
});

it('a view left mid-write still commits the sealed draft for the same seller (navigation durability)', async () => {
  const session = generateWaivedSession();
  const slot = codec.draftSlot(session);
  const { result, unmount } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
  act(() => { result.current.change({ memo: 'kept across navigation' }); result.current.save(); });
  unmount();
  await waitFor(() => { expect(sessionStorage.getItem(slot)).not.toBeNull(); });
  expect(await codec.openDraft(slot, sessionStorage.getItem(slot)!)).toMatchObject({ memo: 'kept across navigation' });
});
