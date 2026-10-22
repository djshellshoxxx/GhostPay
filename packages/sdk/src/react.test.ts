import { describe, expect, it } from 'vitest';
import { buildInvoice, encodeInvoiceLink, signInvoiceWith } from './builder.js';
import { createClient } from './client.js';
import { NOW, SIGNING_KEY, input, testRng } from './fixtures.testutil.js';
import { createReactHooks, type ReactLike, type VerdictState } from './react.js';

/** Tiny hook runtime: slots for state, effects run on flush when deps changed. */
function fakeReact() {
  const slots: unknown[] = [];
  const effects: { deps: readonly unknown[] | undefined; cleanup: void | (() => void) }[] = [];
  const pendingEffects: (() => void)[] = [];
  let si = 0;
  let ei = 0;
  const react: ReactLike = {
    useState<S>(initial: S | (() => S)) {
      const i = si++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? (initial as () => S)() : initial;
      return [
        slots[i] as S,
        (v) => {
          slots[i] = typeof v === 'function' ? (v as (p: S) => S)(slots[i] as S) : v;
        },
      ];
    },
    useEffect(effect, deps) {
      const i = ei++;
      const prev = effects[i];
      const changed = prev === undefined || deps === undefined || prev.deps === undefined || deps.some((d, k) => !Object.is(d, prev.deps?.[k]));
      if (!changed) return;
      pendingEffects.push(() => {
        if (typeof prev?.cleanup === 'function') prev.cleanup();
        effects[i] = { deps, cleanup: effect() };
      });
    },
  };
  return {
    react,
    render: <T,>(fn: () => T): T => {
      si = 0;
      ei = 0;
      const out = fn();
      for (const e of pendingEffects.splice(0)) e();
      return out;
    },
    unmount: (): void => {
      for (const e of effects) if (typeof e.cleanup === 'function') e.cleanup();
    },
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('createReactHooks (no react import)', () => {
  it('useInvoiceVerdict: idle -> loading -> done, recomputes on change, discards stale results', async () => {
    const { react, render } = fakeReact();
    const hooks = createReactHooks(react);
    const signed = signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY);
    const frag = await encodeInvoiceLink(signed);
    const use = (f: string | null, now: number): VerdictState => render(() => hooks.useInvoiceVerdict(f, { nowSeconds: now, pinnedSigners: [] }));

    expect(use(null, NOW).status).toBe('idle');
    expect(use(null, NOW).status).toBe('idle');
    expect(use(frag, NOW).status).toBe('idle'); // effect runs after first render
    expect(use(frag, NOW).status).toBe('loading');
    await tick();
    const done = use(frag, NOW);
    expect(done.status).toBe('done');
    expect(done.status === 'done' && done.result.parsed && done.result.verdict.ok).toBe(true);
    // change clock to past expiry
    use(frag, NOW + 7200);
    await tick();
    const expired = use(frag, NOW + 7200);
    expect(expired.status === 'done' && expired.result.parsed && expired.result.verdict.blockers).toEqual(['invoice-expired']);
    // stale: switch fragment twice quickly; only the last wins
    use('#gpi=v1.@@@', NOW);
    use(frag, NOW);
    await tick();
    const last = use(frag, NOW);
    expect(last.status === 'done' && last.result.parsed).toBe(true);
    // back to idle (effect applies after the render that changed the input)
    use(null, NOW);
    expect(use(null, NOW).status).toBe('idle');
  });
  it('invalid nowSeconds becomes a safe done/unparsed state, not an unhandled rejection', async () => {
    const { react, render } = fakeReact();
    const hooks = createReactHooks(react);
    const frag = await encodeInvoiceLink(signInvoiceWith(buildInvoice(input(), testRng()), SIGNING_KEY));
    const use = (): VerdictState => render(() => hooks.useInvoiceVerdict(frag, { nowSeconds: -5, expectedChainId: 8453, mode: 'any' }));
    use();
    await tick();
    const s = use();
    expect(s.status === 'done' && s.result).toEqual({ parsed: false, invoiceCode: 'UNKNOWN', verdict: undefined });
  });
  it('useGhostPayEvents subscribes once per client/handler and unsubscribes on cleanup', () => {
    const { react, render, unmount } = fakeReact();
    const hooks = createReactHooks(react);
    const client = createClient();
    const seen: string[] = [];
    const handler = (e: { type: string }): void => void seen.push(e.type);
    render(() => hooks.useGhostPayEvents(client, handler));
    render(() => hooks.useGhostPayEvents(client, handler));
    client.invoices.build(input(), testRng());
    expect(seen).toEqual(['invoice.built']);
    unmount();
    client.invoices.build(input(), testRng());
    expect(seen).toHaveLength(1);
  });
});
