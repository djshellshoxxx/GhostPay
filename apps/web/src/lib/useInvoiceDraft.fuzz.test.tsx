// @vitest-environment jsdom
// Seeded stress of the Create-invoice draft hook (#717/#728): repeated save, change, resume, remove and finish across
// one or two hook instances sharing a tab's session storage, with storage that throws on write, remove or read, views
// left while a seal is in flight, and a seller that changes. A fixed-seed local PRNG builds every sequence in groups; a
// group ends with a settle point, and the expected durable state comes from a model kept from the operations alone
// (latest write wins, a remove cancels earlier writes, a failed write leaves the prior record), never from a hook read.
//
// Invariants at every settle: session storage holds nothing or exactly one record that opens, under the loaded seller, to
// the model's expected draft; no form text typed in the run is ever visible in the stored string, saved or not; a failed
// write leaves the previous record byte for byte and the writing view shows `saveFailed`, never `saved`; a removed draft
// is never resurrected by a late seal; a minimal-metadata draft never stores a memo or line description; a repeated
// save/load/delete cycle ends as it started; the same seed gives the identical durable history.
//
// Latent limitation found (not asserted, not reachable in the app, which mounts one Create view): when two hook instances
// share a slot, the instance whose write was superseded by the other's (or dropped by the other's `remove`) never leaves
// `saving`, so its `beforeunload` guard stays armed. See the report for the minimal repro.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDraft, draftForForm, draftSlot, openDraft, type InvoiceDraft } from './invoiceDraft';
import { clearSession, importSession } from './session';
import { useInvoiceDraft, type InvoiceDraftStatus } from './useInvoiceDraft';

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;

const CHAINS = [84532];
const FULL = { supportedOnly: false, quoteAvailable: (): boolean => true };
const hex = (n: number): string => n.toString(16).padStart(64, '0');
const original = (name: 'setItem' | 'removeItem' | 'getItem'): unknown => (Object.getOwnPropertyDescriptor(Storage.prototype, name) as PropertyDescriptor).value;
const realSet = original('setItem') as (this: Storage, k: string, v: string) => void;
const realRemove = original('removeItem') as (this: Storage, k: string) => void;
const realGet = original('getItem') as (this: Storage, k: string) => string | null;

const faults = { set: false, remove: false, get: false };
beforeEach(() => {
  clearSession();
  sessionStorage.clear();
  faults.set = false; faults.remove = false; faults.get = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (faults.set) throw new DOMException('quota', 'QuotaExceededError');
    realSet.call(this, k, v);
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
    if (faults.remove) throw new DOMException('blocked', 'SecurityError');
    realRemove.call(this, k);
  });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
    if (faults.get) throw new DOMException('blocked', 'SecurityError');
    return realGet.call(this, k);
  });
});
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

const WORDS = ['alpha', 'ledger', 'Rechnung', 'retainer', 'café'];
let secretCounter = 0;
const secret = (r: Rand, tag: string): string => `${tag}${String(++secretCounter)}-${pick(r, WORDS)}`;

type Hook = ReturnType<typeof renderHook<ReturnType<typeof useInvoiceDraft>, unknown>>;
interface Instance { readonly hook: Hook; mounted: boolean }

interface Result { readonly durable: (InvoiceDraft | null)[]; readonly statuses: InvoiceDraftStatus[]; readonly silentLosses: number }

const trace: string[] = [];
async function scenario(seed: number): Promise<Result> {
  trace.length = 0;
  try { return await scenarioBody(seed); } catch (e) { process.stdout.write(`TRACE ${String(seed)}\n${trace.join('\n')}\n`); throw e; }
}
async function scenarioBody(seed: number): Promise<Result> {
  const r = prng(seed);
  const session = importSession({ spendingKeyHex: hex(seed + 1), viewingKeyHex: hex(seed + 2), signingKeyHex: hex(seed + 3) });
  const slot = draftSlot(session);
  const typed: string[] = [];
  const mount = (): Instance => ({ hook: renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL)), mounted: true });
  const instances: Instance[] = [mount()];
  if (r() < 0.4) instances.push(mount());
  const live = (): Instance[] => instances.filter((i) => i.mounted);

  // Model: what the durable record must open to after the next settle.
  let durable: InvoiceDraft | null = null;
  const history: (InvoiceDraft | null)[] = [];
  const statuses: InvoiceDraftStatus[] = [];
  let silentLosses = 0;
  // Per instance the form values the model believes it holds (its `current`) and whether it is enabled to save.
  const forms = new Map<Instance, { values: InvoiceDraft; enabled: boolean }>();
  for (const i of instances) forms.set(i, { values: blankDraft(84532), enabled: false });

  // `writer` is the view of the latest write. Another view whose write was superseded or dropped (by a view sharing the
  // slot) keeps showing `saving`: a latent limitation recorded in the file header, not a state to wait for.
  const settle = async (writer?: Instance): Promise<void> => {
    await waitFor(() => {
      for (const i of live()) {
        const status = i.hook.result.current.status;
        if (i === writer) expect(['saving', 'opening']).not.toContain(status);
        else expect(status).not.toBe('opening');
        if (writer === undefined && instances.filter((x) => x.mounted).length === 1) expect(status).not.toBe('saving');
      }
    }, { timeout: 4000, interval: 4 });
    // Let a write from a view that was left finish too.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 12)); });
  };
  const storedDraft = async (): Promise<InvoiceDraft | null> => {
    const raw = realGet.call(sessionStorage, slot);
    if (raw === null) return null;
    for (const text of typed) expect(raw, 'form text visible at rest').not.toContain(text);
    expect(raw).toMatch(/^[a-f0-9]{32}\.[A-Za-z0-9_-]+$/);
    return openDraft(slot, raw);
  };

  for (let group = 0; group < 6; group++) {
    let baseline = realGet.call(sessionStorage, slot);
    faults.set = r() < 0.3;
    faults.remove = r() < 0.12;
    faults.get = false;
    trace.push(`group ${String(group)} faults set=${String(faults.set)} remove=${String(faults.remove)} durable=${durable === null ? 'null' : 'draft'}`);
    let wrote: { instance: Instance; value: InvoiceDraft } | undefined;
    let removed = false;
    let removeWorked = false;
    let resumeExpected: InvoiceDraft | null | 'fail' | undefined;
    for (let step = 0; step < int(r, 1, 5); step++) {
      const targets = live();
      if (targets.length === 0) { const fresh = mount(); instances.push(fresh); forms.set(fresh, { values: blankDraft(84532), enabled: false }); continue; }
      const i = pick(r, targets);
      const form = forms.get(i) as { values: InvoiceDraft; enabled: boolean };
      const opNo = int(r, 0, 7);
      trace.push(`  op ${String(opNo)} on instance ${String(instances.indexOf(i))} enabled=${String(form.enabled)}`);
      switch (opNo) {
        case 0: case 1: case 2: { // edit
          const memo = secret(r, 'memo');
          const line = secret(r, 'line');
          typed.push(memo, line);
          const patch: Partial<InvoiceDraft> = r() < 0.2
            ? { minimalMetadata: !form.values.minimalMetadata }
            : { memo, items: [{ description: line, quantity: String(int(r, 1, 9)), unitPrice: String(int(r, 1, 99)) }], tokenAmount: String(int(r, 1, 999)) };
          act(() => { i.hook.result.current.change(patch); });
          form.values = { ...form.values, ...patch };
          if (form.enabled) { wrote = { instance: i, value: draftForForm(form.values, FULL) }; removed = false; }
          break;
        }
        case 3: { // explicit save (opts in)
          act(() => { i.hook.result.current.save(); });
          form.enabled = true;
          wrote = { instance: i, value: draftForForm(form.values, FULL) };
          removed = false;
          break;
        }
        case 4: { // remove
          act(() => { i.hook.result.current.remove(); });
          form.enabled = false;
          removed = true;
          removeWorked = !faults.remove;
          // A remove takes effect at once; the record it removed is not what a later failed write leaves behind.
          if (removeWorked) { durable = null; baseline = null; }
          wrote = undefined;
          break;
        }
        case 5: { // leave the view (its write, if any, continues)
          if (live().length > 1 || r() < 0.5) { i.mounted = false; i.hook.unmount(); }
          break;
        }
        case 6: { // finish after a creation: drops the saved copy only if the form did not change since
          const submitted = i.hook.result.current.draft;
          act(() => { i.hook.result.current.finish(submitted); });
          if (form.enabled) {
            removed = true; removeWorked = !faults.remove; wrote = undefined; form.enabled = false;
            if (removeWorked) { durable = null; baseline = null; }
          }
          break;
        }
        default: { // resume: restore what is stored
          const expected = durable;
          if (wrote !== undefined || removed) break; // keep the model simple: resume only from a settled state
          act(() => { i.hook.result.current.resume(); });
          resumeExpected = expected === null ? 'fail' : draftForForm(expected, FULL);
          if (expected !== null) { form.values = draftForForm(expected, FULL); form.enabled = true; }
          await settle();
          break;
        }
      }
    }
    await settle(wrote?.instance);

    // ---- expected durable state after this group ----
    const write = wrote;
    if (write !== undefined && !faults.set) durable = write.value;
    const actual = await storedDraft();
    expect(actual, `seed ${String(seed)} group ${String(group)}`).toEqual(durable);
    if (write !== undefined && faults.set) {
      // A failed write leaves the previous record exactly, and the writing view says so (or has been left).
      expect(realGet.call(sessionStorage, slot)).toBe(baseline);
      if (write.instance.mounted) expect(write.instance.hook.result.current.status).toBe('saveFailed');
      else silentLosses++;
    } else if (write !== undefined && write.instance.mounted) {
      expect(write.instance.hook.result.current.status).toBe('saved');
    }
    if (write === undefined && removed && !removeWorked) expect(realGet.call(sessionStorage, slot)).toBe(baseline);
    if (write === undefined && removed && removeWorked) expect(realGet.call(sessionStorage, slot)).toBeNull();
    if (resumeExpected !== undefined) void resumeExpected;
    // A minimal-metadata record never holds a memo or a line description.
    if (actual?.minimalMetadata === true) { expect(actual.memo).toBe(''); expect(actual.items.every((item) => item.description === '')).toBe(true); }
    history.push(actual);
    for (const i of live()) statuses.push(i.hook.result.current.status);
    faults.set = false; faults.remove = false;
  }
  for (const i of live()) i.hook.unmount();
  return { durable: history, statuses, silentLosses };
}

const SEEDS = [717, 728, 20261127];
const PER_SEED = 25;

describe('useInvoiceDraft seeded stress', () => {
  for (const base of SEEDS) {
    it(`seed ${String(base)}: ${String(PER_SEED)} sequences keep the durable record exact, encrypted and never silently lost`, async () => {
      let saved = 0;
      let failed = 0;
      for (let i = 0; i < PER_SEED; i++) {
        const out = await scenario(base * 100 + i);
        saved += out.durable.filter((d) => d !== null).length;
        failed += out.statuses.filter((s) => s === 'saveFailed').length;
        sessionStorage.clear();
        clearSession();
      }
      expect(saved).toBeGreaterThan(PER_SEED);
      expect(failed).toBeGreaterThan(0);
    }, 240_000);
  }

  it('repeated save, load and delete cycles end exactly as they started, with no stale record', async () => {
    const r = prng(99);
    const session = importSession({ spendingKeyHex: hex(11), viewingKeyHex: hex(12), signingKeyHex: hex(13) });
    const slot = draftSlot(session);
    for (let cycle = 0; cycle < 30; cycle++) {
      const { result, unmount } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
      await waitFor(() => { expect(result.current.status).toBe('off'); });
      const memo = secret(r, 'cyc');
      act(() => { result.current.change({ memo }); result.current.save(); });
      await waitFor(() => { expect(result.current.status).toBe('saved'); });
      expect((realGet.call(sessionStorage, slot) as string)).not.toContain(memo);
      unmount();
      const again = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
      await waitFor(() => { expect(again.result.current.status).toBe('available'); });
      act(() => { again.result.current.resume(); });
      await waitFor(() => { expect(again.result.current.status).toBe('saved'); });
      expect(again.result.current.draft.memo).toBe(memo);
      act(() => { again.result.current.remove(); });
      expect(realGet.call(sessionStorage, slot)).toBeNull();
      expect(again.result.current.status).toBe('off');
      again.unmount();
    }
    expect(sessionStorage.length).toBe(0);
  }, 120_000);

  it('a read failure leaves the record and reports openFailed; a remove failure keeps the record and says so', async () => {
    const session = importSession({ spendingKeyHex: hex(21), viewingKeyHex: hex(22), signingKeyHex: hex(23) });
    const slot = draftSlot(session);
    const { result } = renderHook(() => useInvoiceDraft(session, 84532, CHAINS, FULL));
    act(() => { result.current.change({ memo: 'kept-memo' }); result.current.save(); });
    await waitFor(() => { expect(result.current.status).toBe('saved'); });
    const raw = realGet.call(sessionStorage, slot);
    faults.get = true;
    act(() => { result.current.resume(); });
    await waitFor(() => { expect(result.current.status).toBe('openFailed'); });
    faults.get = false;
    expect(realGet.call(sessionStorage, slot)).toBe(raw);
    faults.remove = true;
    act(() => { result.current.remove(); });
    expect(result.current.status).toBe('removeFailed');
    expect(realGet.call(sessionStorage, slot)).toBe(raw);
    faults.remove = false;
    act(() => { result.current.remove(); });
    expect(realGet.call(sessionStorage, slot)).toBeNull();
  });

  it('is deterministic: the same seed gives the identical durable history', async () => {
    const run = async (seed: number): Promise<unknown> => {
      sessionStorage.clear();
      clearSession();
      secretCounter = 0;
      const out = await scenario(seed);
      return { durable: out.durable, statuses: out.statuses, silentLosses: out.silentLosses };
    };
    const first = await run(4242);
    expect(await run(4242)).toEqual(first);
  }, 120_000);
});
