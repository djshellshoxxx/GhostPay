import { useEffect, useRef, useState } from 'react';
import { blankDraft, draftSlot, openDraft, sealDraft, type InvoiceDraft } from './invoiceDraft';
import type { SessionPublic } from './session';

type Status = 'off' | 'available' | 'opening' | 'saving' | 'saved' | 'saveFailed' | 'openFailed' | 'removeFailed';

// A view can be left while encryption is in flight. A newer edit or removal supersedes that write.
const latestWrite = new Map<string, Promise<void>>();

export function useInvoiceDraft(session: SessionPublic | undefined, initialChain: number) {
  const slot = session === undefined ? undefined : draftSlot(session);
  const [draft, setDraft] = useState(() => blankDraft(initialChain));
  const [status, setStatus] = useState<Status>('off');
  const enabled = useRef(false);
  const current = useRef(draft);
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
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const save = (value: InvoiceDraft): void => {
    if (slot === undefined) return;
    enabled.current = true;
    setStatus('saving');
    const pending = sealDraft(slot, value).then(raw => {
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
      const restored = await openDraft(slot, sessionStorage.getItem(slot) ?? '');
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
  return { draft, change, status, resume, save: () => save(current.current), remove,
    finish: (submitted: InvoiceDraft) => { if (enabled.current && submitted === current.current) remove(); } };
}
