import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { encodeProof } from './proof.js';
import {
  assertTolerance,
  classifyAmount,
  confirm,
  newInvoice,
  reconcile,
  toleranceAmount,
  transition,
  type Invoice,
  type Transfer,
} from './reconcile.js';

const h = (n: number): string => '0x' + n.toString(16).padStart(64, '0');
const nonce = (n: number): string => n.toString(16).padStart(32, '0');
const TOK = 'usdc';
const inv = (n: number, expected = 1_000_000n, extra: Partial<Invoice> = {}): Invoice => ({
  ...newInvoice({ nonce: nonce(n), chainId: 8453, token: TOK, expected, issuedAt: 1000, expiresAt: 5000 }),
  ...extra,
});
const tr = (n: number, amount: bigint, extra: Partial<Transfer> = {}): Transfer => ({
  txHash: h(n),
  chainId: 8453,
  token: TOK,
  amount,
  observedAt: 2000,
  ...extra,
});
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof FlowError ? e.code : 'NON_FLOW';
  }
  return undefined;
};

describe('classifyAmount / tolerance', () => {
  it('exact, partial, over with no tolerance', () => {
    expect(classifyAmount(1000n, 1000n)).toBe('exact');
    expect(classifyAmount(1000n, 999n)).toBe('partial');
    expect(classifyAmount(1000n, 1001n)).toBe('over');
  });
  it('tolerance is max(absolute, bps share), inclusive', () => {
    const t = { absolute: 5n, bps: 100 }; // 1% of 1000 = 10
    expect(toleranceAmount(1000n, t)).toBe(10n);
    expect(toleranceAmount(100n, t)).toBe(5n);
    expect(classifyAmount(1000n, 990n, t)).toBe('tolerated');
    expect(classifyAmount(1000n, 1010n, t)).toBe('tolerated');
    expect(classifyAmount(1000n, 989n, t)).toBe('partial');
    expect(classifyAmount(1000n, 1011n, t)).toBe('over');
  });
  it('handles amounts beyond 2^53 without precision loss', () => {
    const e = 10n ** 30n;
    expect(classifyAmount(e, e + 1n)).toBe('over');
    expect(classifyAmount(e, e - 1n, { absolute: 1n, bps: 0 })).toBe('tolerated');
  });
  it('rejects bad inputs', () => {
    expect(code(() => classifyAmount(0n, 1n))).toBe('BAD_AMOUNT');
    expect(code(() => classifyAmount(1n, -1n))).toBe('BAD_AMOUNT');
    expect(code(() => assertTolerance({ absolute: -1n, bps: 0 }))).toBe('BAD_TOLERANCE');
    expect(code(() => assertTolerance({ absolute: 0n, bps: 10001 }))).toBe('BAD_TOLERANCE');
    expect(code(() => assertTolerance({ absolute: 0n, bps: 1.5 }))).toBe('BAD_TOLERANCE');
  });
  it('property: result is symmetric about expected within tolerance', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 0n, max: 10n ** 20n }),
        fc.integer({ min: 0, max: 10000 }),
        (e, d, bps) => {
          const t = { absolute: 0n, bps };
          const lo = e - d < 0n ? 0n : e - d;
          const a = classifyAmount(e, lo, t);
          const b = classifyAmount(e, e + d, t);
          if (e - d >= 0n) expect(a === 'partial').toBe(b === 'over');
        },
      ),
    );
  });
});

describe('transition', () => {
  it('open -> suggested -> paid -> swept', () => {
    let i = transition(inv(1), { type: 'suggest', txHash: h(1) });
    expect(i.status).toBe('suggested');
    expect(i.suggestedTx).toBe(h(1));
    i = transition(i, { type: 'payment', transfer: tr(1, 1_000_000n) });
    expect(i.status).toBe('paid');
    expect(i.suggestedTx).toBeUndefined();
    expect(i.confirmedTx).toBeUndefined();
    i = transition(i, { type: 'sweep' });
    expect(i.status).toBe('swept');
    expect(code(() => transition(i, { type: 'payment', transfer: tr(2, 5n) }))).toBe('INVALID_TRANSITION');
  });
  it('T-5 underpayment -> partial; top-up -> paid; surplus -> overpaid', () => {
    let i = transition(inv(1), { type: 'payment', transfer: tr(1, 400_000n) });
    expect(i.status).toBe('partial');
    expect(i.paid).toBe(400_000n);
    i = transition(i, { type: 'payment', transfer: tr(2, 600_000n) });
    expect(i.status).toBe('paid');
    i = transition(i, { type: 'payment', transfer: tr(3, 1n) });
    expect(i.status).toBe('overpaid');
    expect(i.txs).toEqual([h(1), h(2), h(3)]);
  });
  it('repeat tx is a no-op; tolerance counts as paid', () => {
    const i = transition(inv(1), { type: 'payment', transfer: tr(1, 999_990n) }, { absolute: 10n, bps: 0 });
    expect(i.status).toBe('paid');
    expect(transition(i, { type: 'payment', transfer: tr(1, 999_990n) })).toBe(i);
  });
  it('rejects wrong chain or token', () => {
    expect(code(() => transition(inv(1), { type: 'payment', transfer: tr(1, 5n, { chainId: 1 }) }))).toBe(
      'INVALID_TRANSITION',
    );
    expect(code(() => transition(inv(1), { type: 'payment', transfer: tr(1, 5n, { token: 'dai' }) }))).toBe(
      'INVALID_TRANSITION',
    );
  });
  it('expire only after expiresAt; late payment flagged', () => {
    expect(code(() => transition(inv(1), { type: 'expire', now: 5000 }))).toBe('INVALID_TRANSITION');
    const e = transition(inv(1), { type: 'expire', now: 5001 });
    expect(e.status).toBe('expired');
    expect(code(() => transition(e, { type: 'expire', now: 9999 }))).toBe('INVALID_TRANSITION');
    const p = transition(e, { type: 'payment', transfer: tr(1, 1_000_000n, { observedAt: 6000 }) });
    expect(p.status).toBe('paid');
    expect(p.late).toBe(true);
    const q = transition(inv(2), { type: 'payment', transfer: tr(2, 1_000_000n, { observedAt: 5001 }) });
    expect(q.late).toBe(true);
    expect(transition(inv(3), { type: 'payment', transfer: tr(3, 1_000_000n) }).late).toBeUndefined();
  });
  it('cancel only from open/suggested; partial holds money', () => {
    expect(transition(inv(1), { type: 'cancel' }).status).toBe('cancelled');
    const part = transition(inv(1), { type: 'payment', transfer: tr(1, 1n) });
    expect(code(() => transition(part, { type: 'cancel' }))).toBe('INVALID_TRANSITION');
    expect(
      code(() =>
        transition(transition(inv(1), { type: 'cancel' }), { type: 'payment', transfer: tr(1, 1n) }),
      ),
    ).toBe('INVALID_TRANSITION');
  });
  it('suggest only from open; sweep only from paid/overpaid', () => {
    const s = transition(inv(1), { type: 'suggest', txHash: h(1) });
    expect(code(() => transition(s, { type: 'suggest', txHash: h(2) }))).toBe('INVALID_TRANSITION');
    expect(code(() => transition(inv(1), { type: 'sweep' }))).toBe('INVALID_TRANSITION');
    expect(code(() => transition(inv(1), { type: 'suggest', txHash: 'nope' }))).toBe('BAD_TX_HASH');
  });
  it('newInvoice validates', () => {
    expect(
      code(() => newInvoice({ nonce: 'x', chainId: 1, token: TOK, expected: 1n, issuedAt: 0, expiresAt: 1 })),
    ).toBe('BAD_NONCE');
    expect(
      code(() =>
        newInvoice({ nonce: nonce(1), chainId: 1, token: 'USDC', expected: 1n, issuedAt: 0, expiresAt: 1 }),
      ),
    ).toBe('BAD_TOKEN');
    expect(
      code(() =>
        newInvoice({ nonce: nonce(1), chainId: 1, token: '', expected: 1n, issuedAt: 0, expiresAt: 1 }),
      ),
    ).toBe('BAD_TOKEN');
    expect(
      code(() =>
        newInvoice({ nonce: nonce(1), chainId: 1, token: TOK, expected: 0n, issuedAt: 0, expiresAt: 1 }),
      ),
    ).toBe('BAD_AMOUNT');
    expect(
      code(() =>
        newInvoice({ nonce: nonce(1), chainId: 1, token: TOK, expected: 1n, issuedAt: 5, expiresAt: 1 }),
      ),
    ).toBe('BAD_INVOICE');
    expect(
      code(() =>
        newInvoice({ nonce: nonce(1), chainId: 1, token: TOK, expected: 1n, issuedAt: -1, expiresAt: 1 }),
      ),
    ).toBe('BAD_TIME');
    expect(code(() => reconcile([{ ...inv(1), paid: -1n }], []))).toBe('BAD_AMOUNT');
    expect(code(() => reconcile([], [tr(1, 0n)]))).toBe('BAD_AMOUNT');
    expect(code(() => reconcile([], [tr(1, 1n, { txHash: h(255).toUpperCase().replace('0X', '0x') })]))).toBe(
      'BAD_TX_HASH',
    );
  });
});

describe('reconcile (heuristic)', () => {
  it('unique exact match is suggested, money not applied', () => {
    const r = reconcile([inv(1), inv(2, 5n)], [tr(1, 1_000_000n)]);
    expect(r.outcomes).toEqual([{ kind: 'suggested', txHash: h(1), nonce: nonce(1), amountClass: 'exact' }]);
    expect(r.invoices[0]?.status).toBe('suggested');
    expect(r.invoices[0]?.paid).toBe(0n);
    expect(r.invoices[1]?.status).toBe('open');
  });
  it('T-1 equal amounts: ambiguous, none confirmed or changed (PAYRE-1)', () => {
    const input = [inv(1), inv(2)];
    const r = reconcile(input, [tr(1, 1_000_000n)]);
    expect(r.outcomes[0]).toMatchObject({ kind: 'ambiguous' });
    expect((r.outcomes[0] as unknown as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(r.invoices.every((i) => i.status === 'open' && i.confirmedTx === undefined)).toBe(true);
    expect(input[0]?.status).toBe('open');
  });
  it('requires same chain, token and window (PAYRE-5)', () => {
    const base = [inv(1)];
    for (const t of [
      tr(1, 1_000_000n, { chainId: 1 }),
      tr(1, 1_000_000n, { token: 'dai' }),
      tr(1, 1_000_000n, { observedAt: 999 }),
      tr(1, 1_000_000n, { observedAt: 5001 }),
    ]) {
      expect(reconcile(base, [t]).outcomes[0]).toEqual({ kind: 'unmatched', txHash: h(1) });
    }
    expect(reconcile(base, [tr(1, 1_000_000n, { observedAt: 1000 })]).outcomes[0]?.kind).toBe('suggested');
    expect(reconcile(base, [tr(2, 1_000_000n, { observedAt: 5000 })]).outcomes[0]?.kind).toBe('suggested');
  });
  it('partial and over are never heuristically matched', () => {
    expect(reconcile([inv(1)], [tr(1, 400_000n)]).outcomes[0]?.kind).toBe('unmatched');
    expect(reconcile([inv(1)], [tr(1, 2_000_000n)]).outcomes[0]?.kind).toBe('unmatched');
  });
  it('tolerance widens matching', () => {
    const r = reconcile([inv(1)], [tr(1, 999_999n)], { absolute: 1n, bps: 0 });
    expect(r.outcomes[0]).toMatchObject({ kind: 'suggested', amountClass: 'tolerated' });
  });
  it('duplicates: repeated tx and second payment to a settled invoice', () => {
    const r = reconcile(
      [inv(1)],
      [tr(1, 1_000_000n), tr(1, 1_000_000n, { observedAt: 2100 }), tr(2, 1_000_000n, { observedAt: 2200 })],
    );
    expect(r.outcomes.map((o) => o.kind)).toEqual(['suggested', 'duplicate', 'duplicate']);
    expect(r.outcomes[1]).toMatchObject({ reason: 'repeat-tx' });
    expect(r.outcomes[2]).toMatchObject({ reason: 'invoice-settled' });
    const again = reconcile(r.invoices, [tr(1, 1_000_000n)]);
    expect(again.outcomes[0]).toMatchObject({ kind: 'duplicate', reason: 'repeat-tx' });
    const paid = transition(inv(1), { type: 'payment', transfer: tr(9, 1_000_000n) });
    expect(reconcile([paid], [tr(3, 1_000_000n)]).outcomes[0]).toMatchObject({ reason: 'invoice-settled' });
    const sw = transition(paid, { type: 'sweep' });
    expect(reconcile([sw], [tr(3, 1_000_000n)]).outcomes[0]).toMatchObject({ reason: 'invoice-settled' });
    expect(reconcile([paid], [tr(9, 1_000_000n)]).outcomes[0]).toMatchObject({ reason: 'repeat-tx' });
  });
  it('is independent of input order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(
          [tr(1, 1_000_000n), tr(2, 1_000_000n, { observedAt: 2000 }), tr(3, 7n, { observedAt: 1500 })],
          { minLength: 3 },
        ),
        (ts) => {
          const a = reconcile([inv(1), inv(2)], ts);
          const b = reconcile([inv(1), inv(2)], [...ts].reverse());
          expect(a).toEqual(b);
        },
      ),
    );
  });
  it('sorts same-time transfers by chain then hash', () => {
    const r = reconcile(
      [],
      [tr(2, 1n, { chainId: 2 }), tr(5, 1n), tr(4, 1n), tr(1, 1n, { chainId: 8453, observedAt: 1999 })],
    );
    expect(r.outcomes.map((o) => o.txHash)).toEqual([h(1), h(2), h(4), h(5)]);
  });
  it('rejects bad tolerance', () => {
    expect(code(() => reconcile([], [], { absolute: 0n, bps: -1 }))).toBe('BAD_TOLERANCE');
  });
});

describe('confirm (proof path)', () => {
  const pf = (n: number, t: number, chainId = 8453): string =>
    encodeProof({ nonce: nonce(n), chainId, txHash: h(t) });
  it('T-2 valid proof confirms; replay is ALREADY_CONFIRMED (PAYRE-3)', () => {
    const r = confirm([inv(1)], pf(1, 1), [tr(1, 1_000_000n)]);
    expect(r).toMatchObject({ ok: true, amountClass: 'exact', warnings: [] });
    if (!r.ok) throw new Error('unreachable');
    expect(r.invoices[0]).toMatchObject({ status: 'paid', confirmedTx: h(1) });
    expect(confirm(r.invoices, pf(1, 1), [tr(1, 1_000_000n)])).toEqual({
      ok: false,
      error: 'ALREADY_CONFIRMED',
    });
    expect(confirm(r.invoices, pf(1, 2), [tr(2, 1_000_000n)])).toEqual({
      ok: false,
      error: 'ALREADY_CONFIRMED',
    });
  });
  it('T-3 tx not among matches -> NOT_FOUND', () => {
    expect(confirm([inv(1)], pf(1, 9), [tr(1, 1_000_000n)])).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
  it('unknown invoice, bad proof, object proof, mismatch', () => {
    expect(confirm([inv(1)], pf(2, 1), [tr(1, 5n)])).toEqual({ ok: false, error: 'UNKNOWN_INVOICE' });
    expect(confirm([inv(1)], 'garbage!', [])).toEqual({ ok: false, error: 'BAD_PROOF' });
    expect(confirm([inv(1)], { nonce: nonce(1), chainId: 8453, txHash: h(1) }, [tr(1, 1_000_000n)]).ok).toBe(
      true,
    );
    expect(confirm([inv(1)], pf(1, 1), [tr(1, 1_000_000n, { token: 'dai' })])).toEqual({
      ok: false,
      error: 'MISMATCH',
    });
    expect(confirm([inv(1, 1n, { chainId: 1 })], pf(1, 1), [tr(1, 1n)])).toEqual({
      ok: false,
      error: 'MISMATCH',
    });
    expect(confirm([inv(1)], pf(1, 1, 1), [tr(1, 1n)])).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
  it('tx already used by another invoice -> DUPLICATE_TX', () => {
    const other = transition(inv(2), { type: 'payment', transfer: tr(1, 1_000_000n) });
    expect(confirm([inv(1), other], pf(1, 1), [tr(1, 1_000_000n)])).toEqual({
      ok: false,
      error: 'DUPLICATE_TX',
    });
  });
  it('cancelled invoice cannot be confirmed', () => {
    const c = transition(inv(1), { type: 'cancel' });
    expect(confirm([c], pf(1, 1), [tr(1, 1_000_000n)])).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
  });
  it('PAYRE-6 partial and over reported distinctly; PAYRE-7 warns on early tx', () => {
    const p = confirm([inv(1)], pf(1, 1), [tr(1, 1n)]);
    expect(p).toMatchObject({ ok: true, amountClass: 'partial' });
    if (p.ok) expect(p.invoices[0]?.status).toBe('partial');
    const o = confirm([inv(1)], pf(1, 1), [tr(1, 3_000_000n, { observedAt: 900 })]);
    expect(o).toMatchObject({ ok: true, amountClass: 'over', warnings: ['TX_BEFORE_ISSUE'] });
    if (o.ok) expect(o.invoices[0]?.status).toBe('overpaid');
  });
  it('confirms heuristic-suggested invoice and clears suggestion', () => {
    const r = reconcile([inv(1)], [tr(1, 1_000_000n)]);
    const c = confirm(r.invoices, pf(1, 1), [tr(1, 1_000_000n)]);
    expect(c.ok && c.invoices[0]?.suggestedTx).toBeUndefined();
  });
});
