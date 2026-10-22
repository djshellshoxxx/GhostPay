import { FlowError } from './errors.js';
import { assertChainId, assertNonce, decodeProof, normalizeTxHash } from './proof.js';
import type { Proof } from './proof.js';

/** Lifecycle of an issued invoice on the seller side. */
export type InvoiceStatus =
  'open' | 'suggested' | 'partial' | 'paid' | 'overpaid' | 'swept' | 'expired' | 'cancelled';

/** An invoice the seller issued. All amounts are bigint base units of `token`. Times are unix seconds. */
export interface Invoice {
  readonly nonce: string;
  readonly chainId: number;
  /** Lowercase token identifier (address or symbol); compared by exact string equality. */
  readonly token: string;
  /** Expected net amount after fee policy (PAYRE-4). Must be > 0. */
  readonly expected: bigint;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly status: InvoiceStatus;
  /** Sum of transfers applied to this invoice. */
  readonly paid: bigint;
  /** Hashes of transfers applied (lowercase). */
  readonly txs: readonly string[];
  /** Set when a payer proof bound a transfer to this invoice (PAYRE-3). */
  readonly confirmedTx?: string;
  /** Tx hash proposed by the heuristic, awaiting seller confirmation. */
  readonly suggestedTx?: string;
  /** True when money arrived after expiry. */
  readonly late?: boolean;
}

/** A transfer observed by the scanner. */
export interface Transfer {
  readonly txHash: string;
  readonly chainId: number;
  readonly token: string;
  readonly amount: bigint;
  readonly observedAt: number;
}

/** Tolerance: a payment within max(absolute, expected*bps/10000) of expected counts as settled. */
export interface Tolerance {
  readonly absolute: bigint;
  /** Integer basis points 0..10000. */
  readonly bps: number;
}

export const NO_TOLERANCE: Tolerance = { absolute: 0n, bps: 0 };

/** How a payment relates to the expected amount. */
export type AmountClass = 'exact' | 'tolerated' | 'partial' | 'over';

/** Validate a tolerance. @throws FlowError BAD_TOLERANCE */
export function assertTolerance(t: Tolerance): void {
  if (typeof t.absolute !== 'bigint' || t.absolute < 0n) throw new FlowError('BAD_TOLERANCE');
  if (!Number.isInteger(t.bps) || t.bps < 0 || t.bps > 10000) throw new FlowError('BAD_TOLERANCE');
}

/** Effective tolerance in base units for an expected amount (floor of bps share, max with absolute). */
export function toleranceAmount(expected: bigint, t: Tolerance): bigint {
  assertTolerance(t);
  const rel = (expected * BigInt(t.bps)) / 10000n;
  return rel > t.absolute ? rel : t.absolute;
}

/** Classify a total paid amount against expected. Pure bigint math (PAYRE-4). */
export function classifyAmount(expected: bigint, paid: bigint, tol: Tolerance = NO_TOLERANCE): AmountClass {
  if (typeof expected !== 'bigint' || expected <= 0n) throw new FlowError('BAD_AMOUNT');
  if (typeof paid !== 'bigint' || paid < 0n) throw new FlowError('BAD_AMOUNT');
  if (paid === expected) return 'exact';
  const tl = toleranceAmount(expected, tol);
  const diff = paid > expected ? paid - expected : expected - paid;
  if (diff <= tl) return 'tolerated';
  return paid < expected ? 'partial' : 'over';
}

function assertTime(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new FlowError('BAD_TIME');
}

function assertToken(t: string): void {
  if (typeof t !== 'string' || t.length === 0 || t.length > 128 || t !== t.toLowerCase())
    throw new FlowError('BAD_TOKEN');
}

/** Validate an invoice record. @throws FlowError */
export function assertInvoice(i: Invoice): void {
  assertNonce(i.nonce);
  assertChainId(i.chainId);
  assertToken(i.token);
  if (typeof i.expected !== 'bigint' || i.expected <= 0n) throw new FlowError('BAD_AMOUNT');
  assertTime(i.issuedAt);
  assertTime(i.expiresAt);
  if (i.expiresAt < i.issuedAt) throw new FlowError('BAD_INVOICE');
  if (typeof i.paid !== 'bigint' || i.paid < 0n) throw new FlowError('BAD_AMOUNT');
}

/** Validate a transfer. @throws FlowError */
export function assertTransfer(t: Transfer): void {
  normalizeTxHash(t.txHash);
  if (t.txHash !== t.txHash.toLowerCase()) throw new FlowError('BAD_TX_HASH');
  assertChainId(t.chainId);
  assertToken(t.token);
  if (typeof t.amount !== 'bigint' || t.amount <= 0n) throw new FlowError('BAD_AMOUNT');
  assertTime(t.observedAt);
}

/** Create a fresh open invoice. @throws FlowError on invalid fields */
export function newInvoice(p: Omit<Invoice, 'status' | 'paid' | 'txs'>): Invoice {
  const inv: Invoice = { ...p, status: 'open', paid: 0n, txs: [] };
  assertInvoice(inv);
  return inv;
}

/** Events accepted by {@link transition}. */
export type InvoiceEvent =
  | { readonly type: 'suggest'; readonly txHash: string }
  | { readonly type: 'payment'; readonly transfer: Transfer; readonly confirmed?: boolean }
  | { readonly type: 'expire'; readonly now: number }
  | { readonly type: 'cancel' }
  | { readonly type: 'sweep' };

function statusFor(inv: Invoice, paid: bigint, tol: Tolerance): InvoiceStatus {
  if (paid === 0n) return inv.status === 'suggested' ? 'suggested' : 'open';
  const c = classifyAmount(inv.expected, paid, tol);
  if (c === 'partial') return 'partial';
  if (c === 'over') return 'overpaid';
  return 'paid';
}

/**
 * Pure state machine for one invoice.
 *
 * - suggest: open -> suggested
 * - payment: open|suggested|partial|expired|paid|overpaid -> partial|paid|overpaid (never from cancelled/swept)
 *   A repeat of an already-applied txHash is a no-op. Payment after expiry sets `late`.
 * - expire: open|suggested|partial -> expired, only when now > expiresAt
 * - cancel: open|suggested -> cancelled (partial invoices hold money and cannot be cancelled)
 * - sweep: paid|overpaid -> swept
 *
 * @security Never sets `confirmedTx` unless the event carries `confirmed: true` (proof-verified by {@link confirm}).
 * @throws FlowError INVALID_TRANSITION for any other combination
 */
export function transition(inv: Invoice, ev: InvoiceEvent, tol: Tolerance = NO_TOLERANCE): Invoice {
  const bad = (): never => {
    throw new FlowError('INVALID_TRANSITION', `${inv.status}+${ev.type}`);
  };
  switch (ev.type) {
    case 'suggest': {
      if (inv.status !== 'open') return bad();
      return { ...inv, status: 'suggested', suggestedTx: normalizeTxHash(ev.txHash) };
    }
    case 'payment': {
      if (inv.status === 'cancelled' || inv.status === 'swept') return bad();
      assertTransfer(ev.transfer);
      const t = ev.transfer;
      if (t.chainId !== inv.chainId || t.token !== inv.token)
        throw new FlowError('INVALID_TRANSITION', 'mismatch');
      if (inv.txs.includes(t.txHash)) return inv;
      const paid = inv.paid + t.amount;
      const next: Invoice = {
        ...inv,
        paid,
        txs: [...inv.txs, t.txHash],
        status: statusFor(inv, paid, tol),
      };
      const { suggestedTx: _s, ...rest } = next;
      void _s;
      const out: Invoice = ev.confirmed === true ? { ...rest, confirmedTx: t.txHash } : rest;
      return inv.status === 'expired' || inv.late === true || t.observedAt > inv.expiresAt
        ? { ...out, late: true }
        : out;
    }
    case 'expire': {
      assertTime(ev.now);
      if (inv.status !== 'open' && inv.status !== 'suggested' && inv.status !== 'partial') return bad();
      if (ev.now <= inv.expiresAt) return bad();
      return { ...inv, status: 'expired' };
    }
    case 'cancel': {
      if (inv.status !== 'open' && inv.status !== 'suggested') return bad();
      return { ...inv, status: 'cancelled' };
    }
    case 'sweep': {
      if (inv.status !== 'paid' && inv.status !== 'overpaid') return bad();
      return { ...inv, status: 'swept' };
    }
  }
}

/** Why a transfer was not proposed against any invoice. */
export type Outcome =
  | {
      readonly kind: 'suggested';
      readonly txHash: string;
      readonly nonce: string;
      readonly amountClass: AmountClass;
    }
  | {
      readonly kind: 'ambiguous';
      readonly txHash: string;
      readonly candidates: readonly { readonly nonce: string; readonly amountClass: AmountClass }[];
    }
  | { readonly kind: 'duplicate'; readonly txHash: string; readonly reason: 'repeat-tx' | 'invoice-settled' }
  | { readonly kind: 'unmatched'; readonly txHash: string };

/** Result of a reconcile pass. */
export interface ReconcileResult {
  readonly invoices: readonly Invoice[];
  readonly outcomes: readonly Outcome[];
}

/**
 * Heuristic matching of observed transfers to open invoices (PAYRE-1, PAYRE-5).
 *
 * A transfer is a candidate for an `open` invoice with the same chainId and token, observed within
 * [issuedAt, expiresAt], whose amount is exact or within tolerance. Exactly one candidate yields a `suggested`
 * invoice (no money applied, never confirmed); several yield `ambiguous` and change nothing. Partial/over amounts are
 * never heuristically matched: they require a payer proof via {@link confirm}. Transfers are processed in
 * (observedAt, chainId, txHash) order so the result is independent of input order.
 *
 * @security Pure; does not auto-confirm. Input arrays are not mutated.
 */
export function reconcile(
  invoices: readonly Invoice[],
  transfers: readonly Transfer[],
  tol: Tolerance = NO_TOLERANCE,
): ReconcileResult {
  assertTolerance(tol);
  for (const i of invoices) assertInvoice(i);
  for (const t of transfers) assertTransfer(t);
  const sorted = [...transfers].sort(
    (a, b) =>
      a.observedAt - b.observedAt ||
      a.chainId - b.chainId ||
      (a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0),
  );
  let state = [...invoices];
  const seen = new Set<string>();
  for (const i of state)
    for (const h of [...i.txs, ...(i.suggestedTx ? [i.suggestedTx] : [])]) seen.add(`${i.chainId}:${h}`);
  const outcomes: Outcome[] = [];
  for (const t of sorted) {
    const key = `${t.chainId}:${t.txHash}`;
    if (seen.has(key)) {
      outcomes.push({ kind: 'duplicate', txHash: t.txHash, reason: 'repeat-tx' });
      continue;
    }
    seen.add(key);
    const fits = (i: Invoice): AmountClass | null => {
      if (i.chainId !== t.chainId || i.token !== t.token) return null;
      if (t.observedAt < i.issuedAt || t.observedAt > i.expiresAt) return null;
      const c = classifyAmount(i.expected, t.amount, tol);
      return c === 'exact' || c === 'tolerated' ? c : null;
    };
    const cands: { nonce: string; amountClass: AmountClass }[] = [];
    let settled = false;
    for (const i of state) {
      const c = fits(i);
      if (c === null) continue;
      if (i.status === 'open') cands.push({ nonce: i.nonce, amountClass: c });
      else if (
        i.status === 'suggested' ||
        i.status === 'paid' ||
        i.status === 'overpaid' ||
        i.status === 'swept'
      )
        settled = true;
    }
    if (cands.length === 1) {
      const only = cands[0] as { nonce: string; amountClass: AmountClass };
      state = state.map((i) =>
        i.nonce === only.nonce ? transition(i, { type: 'suggest', txHash: t.txHash }) : i,
      );
      outcomes.push({
        kind: 'suggested',
        txHash: t.txHash,
        nonce: only.nonce,
        amountClass: only.amountClass,
      });
    } else if (cands.length > 1) {
      outcomes.push({ kind: 'ambiguous', txHash: t.txHash, candidates: cands });
    } else if (settled) {
      outcomes.push({ kind: 'duplicate', txHash: t.txHash, reason: 'invoice-settled' });
    } else {
      outcomes.push({ kind: 'unmatched', txHash: t.txHash });
    }
  }
  return { invoices: state, outcomes };
}

/** Result of {@link confirm}. */
export type ConfirmResult =
  | {
      readonly ok: true;
      readonly invoices: readonly Invoice[];
      readonly nonce: string;
      readonly amountClass: AmountClass;
      readonly warnings: readonly 'TX_BEFORE_ISSUE'[];
    }
  | {
      readonly ok: false;
      readonly error:
        | 'UNKNOWN_INVOICE'
        | 'NOT_FOUND'
        | 'ALREADY_CONFIRMED'
        | 'MISMATCH'
        | 'DUPLICATE_TX'
        | 'INVALID_TRANSITION'
        | 'BAD_PROOF';
    };

/**
 * Confirm payment with a payer proof (exact path). The proof's tx must be among the observed `transfers`
 * (NOT_FOUND otherwise), on the invoice's chain and token (MISMATCH), and not already applied to any invoice
 * (DUPLICATE_TX). A nonce confirms once (ALREADY_CONFIRMED, PAYRE-3). Partial and over payments are applied and
 * reflected in `status` and `amountClass` (PAYRE-6). A tx observed before the invoice was issued still confirms but
 * adds the TX_BEFORE_ISSUE warning (PAYRE-7).
 *
 * @security `proof` may be an untrusted string; decode failures return BAD_PROOF, never throw.
 */
export function confirm(
  invoices: readonly Invoice[],
  proof: Proof | string,
  transfers: readonly Transfer[],
  tol: Tolerance = NO_TOLERANCE,
): ConfirmResult {
  let p: Proof;
  if (typeof proof === 'string') {
    try {
      p = decodeProof(proof);
    } catch (e) {
      if (e instanceof FlowError) return { ok: false, error: 'BAD_PROOF' };
      throw e;
    }
  } else {
    p = proof;
  }
  const inv = invoices.find((i) => i.nonce === p.nonce);
  if (inv === undefined) return { ok: false, error: 'UNKNOWN_INVOICE' };
  if (inv.confirmedTx !== undefined) return { ok: false, error: 'ALREADY_CONFIRMED' };
  const t = transfers.find((x) => x.chainId === p.chainId && x.txHash === p.txHash);
  if (t === undefined) return { ok: false, error: 'NOT_FOUND' };
  if (t.chainId !== inv.chainId || t.token !== inv.token) return { ok: false, error: 'MISMATCH' };
  if (invoices.some((i) => i.chainId === t.chainId && i.txs.includes(t.txHash)))
    return { ok: false, error: 'DUPLICATE_TX' };
  let next: Invoice;
  try {
    next = transition(inv, { type: 'payment', transfer: t, confirmed: true }, tol);
  } catch (e) {
    if (e instanceof FlowError && e.code === 'INVALID_TRANSITION')
      return { ok: false, error: 'INVALID_TRANSITION' };
    throw e;
  }
  return {
    ok: true,
    nonce: inv.nonce,
    amountClass: classifyAmount(inv.expected, next.paid, tol),
    warnings: t.observedAt < inv.issuedAt ? ['TX_BEFORE_ISSUE'] : [],
    invoices: invoices.map((i) => (i.nonce === inv.nonce ? next : i)),
  };
}
