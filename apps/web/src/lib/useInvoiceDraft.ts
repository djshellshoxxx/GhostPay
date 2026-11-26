import { useEffect, useRef, useState } from 'react';
import { blankDraft, draftForForm, draftSlot, leanCanShow, openDraft, sealDraft, type InvoiceDraft } from './invoiceDraft';
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
 * written until the seller opts in; every later edit replaces the record. `supportedOnly` (lean) and the
 * minimal-metadata choice limit what is saved ({@link draftForForm}). A draft this form cannot show unchanged (a chain
 * or token the build does not offer, or in lean fiat pricing or a buffer policy) is refused and kept, never converted.
 */
export function useInvoiceDraft(
  session: SessionPublic | undefined, initialChain: number, supportedOnly: boolean, offeredChains: readonly number[],
) {
  const slot = session === undefined ? undefined : draftSlot(session);
  const [draft, setDraft] = useState(() => blankDraft(initialChain));
  const [status, setStatus] = useState<InvoiceDraftStatus>('off');
  const enabled = useRef(false);
  const current = useRef(draft);
  const lean = useRef(supportedOnly);
  lean.current = supportedOnly;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const inspect = (): void => {
      if (!active || slot === undefined) return;
      try { setStatus(sessionStorage.getItem(slot) === null ? 'off' : 'available'); }
      catch { setStatus('off'); }
    };
    const pending = slot === undefined ? undefined : latestWrite.get(slot);
    if (pending === undefined) inspect();
    else { setStatus('opening'); void pending.then(inspect); }
    return () => { active = false; mounted.current = false; };
  }, [slot]);

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
    const pending: Promise<void> = sealDraft(slot, draftForForm(value, lean.current)).then((raw) => {
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
      if (!offered(saved, offeredChains) || (lean.current && !leanCanShow(saved))) throw new Error('Draft terms are not offered');
      const restored = draftForForm(saved, lean.current);
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
