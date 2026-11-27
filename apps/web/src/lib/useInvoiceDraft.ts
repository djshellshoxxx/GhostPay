import { useEffect, useMemo, useRef, useState } from 'react';
import { blankDraft, draftForForm, formCanShow, openDraft, readableDraftSlot, sealDraft, type DraftForm, type InvoiceDraft } from './invoiceDraft';
import { purgeLegacyInvoiceDrafts } from './invoiceDraftSlots';
import { tokenChoices } from './invoiceCreate';
import type { SessionPublic } from './session';

export type InvoiceDraftStatus = 'off' | 'available' | 'opening' | 'saving' | 'saved' | 'saveFailed' | 'openFailed' | 'removeFailed';

// A view can be left while encryption is in flight. A newer edit or removal supersedes that write.
const latestWrite = new Map<string, Promise<void>>();

/** A restored draft must name an offered chain and one of its tokens: the form could not show any other choice. */
const offered = (draft: InvoiceDraft, chainIds: readonly number[]): boolean =>
  chainIds.includes(draft.chainId) && tokenChoices(draft.chainId).some((choice) => choice.value === draft.token);

/**
 * The Create invoice form values, optionally kept as an encrypted draft in this tab's session storage. Nothing is
 * written until the seller opts in; every later edit replaces the record. What `form` shows and the minimal-metadata
 * choice limit what is saved ({@link draftForForm}). A draft the form cannot show unchanged (a chain or token the build
 * does not offer, a fiat quote without a price feed, or a fiat or buffer choice it hides) is refused and kept, never
 * converted.
 *
 * A draft has no timer. It ends when the tab closes, on {@link finish} after a creation, on `remove`, or when the seller
 * keys are cleared (`clearSession()` removes every draft of the tab). While the keys are locked, the slot name cannot be
 * derived: the view reports no draft and writes nothing.
 */
export function useInvoiceDraft(
  session: SessionPublic | undefined, initialChain: number, offeredChains: readonly number[], form: DraftForm,
) {
  // The slot name derives from the viewing key, so it exists only while those keys are unlocked. Without it nothing here
  // reads, writes or reports a draft: a locked or foreign session sees "no readable draft", never an error.
  const slot = useMemo(() => (session === undefined ? undefined : readableDraftSlot(session)), [session]);
  const [draft, setDraft] = useState(() => blankDraft(initialChain));
  const [status, setStatus] = useState<InvoiceDraftStatus>('off');
  const enabled = useRef(false);
  const current = useRef(draft);
  const shows = useRef(form);
  shows.current = form;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    // A legacy v2 record is named from public keys: never read, never offered, deleted.
    if (session !== undefined) purgeLegacyInvoiceDrafts();
    const inspect = (): void => {
      if (!active || slot === undefined || session === undefined) return;
      // The keys may have been locked since the name was derived (also while a write was in flight): then the name cannot
      // be derived again and no draft is readable.
      if (readableDraftSlot(session) !== slot) { setStatus('off'); return; }
      try { setStatus(sessionStorage.getItem(slot) === null ? 'off' : 'available'); }
      catch { setStatus('off'); }
    };
    const pending = slot === undefined ? undefined : latestWrite.get(slot);
    if (pending === undefined) inspect();
    else { setStatus('opening'); void pending.then(inspect); }
    return () => { active = false; mounted.current = false; };
  }, [slot, session]);

  useEffect(() => {
    if (status !== 'saving' && status !== 'saveFailed') return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); };
  }, [status]);

  const save = (value: InvoiceDraft): void => {
    if (slot === undefined) return;
    enabled.current = true;
    setStatus('saving');
    const pending: Promise<void> = sealDraft(slot, draftForForm(value, shows.current)).then((raw) => {
      if (latestWrite.get(slot) !== pending) return;
      sessionStorage.setItem(slot, raw);
      if (mounted.current) setStatus('saved');
    }).catch(() => {
      if (latestWrite.get(slot) === pending && mounted.current) setStatus('saveFailed');
    }).finally(() => { if (latestWrite.get(slot) === pending) latestWrite.delete(slot); });
    latestWrite.set(slot, pending);
  };
  const resume = (): void => {
    if (slot === undefined) return;
    setStatus('opening');
    void (async () => {
      let raw: string | null;
      try { raw = sessionStorage.getItem(slot); } catch { raw = null; }
      const saved = await openDraft(slot, raw ?? '');
      if (!offered(saved, offeredChains) || !formCanShow(saved, shows.current)) throw new Error('Draft terms are not offered');
      const restored = draftForForm(saved, shows.current);
      if (!mounted.current) return;
      current.current = restored;
      setDraft(restored);
      enabled.current = true;
      setStatus('saved');
    })().catch(() => { if (mounted.current) setStatus('openFailed'); });
  };
  const change = (patch: Partial<InvoiceDraft>): void => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setDraft(next);
    if (enabled.current) save(next);
  };
  const remove = (): void => {
    if (slot === undefined) return;
    enabled.current = false;
    latestWrite.delete(slot);
    try { sessionStorage.removeItem(slot); setStatus('off'); }
    catch { setStatus('removeFailed'); }
  };
  return {
    draft, change, status, resume, save: () => { save(current.current); }, remove,
    /** After a successful creation, drop the saved copy unless the form changed since `submitted` was read. */
    finish: (submitted: InvoiceDraft) => { if (enabled.current && submitted === current.current) remove(); },
  };
}
