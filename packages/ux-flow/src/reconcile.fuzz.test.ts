// Seeded fuzz of the invoice reconciliation state machine and its amount tolerance (#742 made a malformed tolerance fail
// closed even for an exact payment). A fixed-seed local PRNG builds the same invoices, transfers and event sequences
// every run; expected classification comes from an independent bigint oracle here, not from reconcile.ts.
//
// Invariants: a malformed tolerance always throws BAD_TOLERANCE (exact, short and over payments alike); a valid one
// classifies exactly as the oracle says; payment state is never overstated (`paid`/`overpaid` only when the applied sum
// classifies that way, no money applied by `reconcile`, `confirmedTx` only from an event that carried `confirmed: true`,
// cancelled and swept invoices never take money); only FlowError is thrown; same seed, same outcome.
import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import {
  classifyAmount, newInvoice, reconcile, toleranceAmount, transition,
  type AmountClass, type Invoice, type InvoiceEvent, type Tolerance, type Transfer,
} from './reconcile.js';

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
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;
function big(r: Rand, bits: number): bigint {
  let v = 0n;
  for (let i = int(r, 1, bits); i > 0; i--) v = (v << 1n) | (r() < 0.5 ? 1n : 0n);
  return v;
}
const hash = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;
const nonce = (n: number): string => n.toString(16).padStart(32, '0');
const TOKEN = 'usdc';

const MALFORMED: readonly unknown[] = [
  { absolute: -1n, bps: 0 }, { absolute: 0n, bps: 10001 }, { absolute: 0n, bps: 1.5 }, { absolute: 0n, bps: -1 },
  { absolute: 0n, bps: Number.NaN }, { absolute: 0n, bps: Number.POSITIVE_INFINITY }, { absolute: 5, bps: 0 },
  { absolute: '5', bps: 0 }, { absolute: 0n, bps: '10' }, { absolute: undefined, bps: 0 }, { absolute: 0n }, { bps: 0 },
  { absolute: 0n, bps: 1e9 }, { absolute: -(10n ** 30n), bps: 5 },
];

/** Independent oracle: tolerance is max(absolute, floor(expected * bps / 10000)), inclusive; exact wins first. */
function oracle(expected: bigint, paid: bigint, t: Tolerance): AmountClass {
  const rel = (expected * BigInt(t.bps)) / 10000n;
  const tolerance = rel > t.absolute ? rel : t.absolute;
  if (paid === expected) return 'exact';
  const diff = paid > expected ? paid - expected : expected - paid;
  if (diff <= tolerance) return 'tolerated';
  return paid < expected ? 'partial' : 'over';
}
const flowCode = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(FlowError); return (e as FlowError).code; }
  return undefined;
};

const SEEDS = [742, 1125, 90001];

describe('classifyAmount and tolerance, seeded', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: 1500 valid tolerances classify exactly as the oracle; malformed ones always refuse`, () => {
      const r = prng(seed);
      const seen = new Set<AmountClass>();
      for (let i = 0; i < 1500; i++) {
        const expected = 1n + big(r, 100);
        const tol: Tolerance = { absolute: r() < 0.4 ? 0n : big(r, 90), bps: pick(r, [0, 0, 1, 99, 100, 5000, 9999, 10000, int(r, 0, 10000)]) };
        const around = pick(r, [0n, 1n, -1n, tol.absolute, -tol.absolute, toleranceAmount(expected, tol), -toleranceAmount(expected, tol), toleranceAmount(expected, tol) + 1n, -(toleranceAmount(expected, tol) + 1n), big(r, 100)]);
        const paid = r() < 0.15 ? expected : expected + around < 0n ? 0n : expected + around;
        expect(classifyAmount(expected, paid, tol)).toBe(oracle(expected, paid, tol));
        seen.add(classifyAmount(expected, paid, tol));
        // A malformed tolerance refuses whatever the payment is, an exact one included.
        const bad = pick(r, MALFORMED) as Tolerance;
        for (const p of [expected, expected - 1n > 0n ? expected - 1n : 0n, expected + 1n]) expect(flowCode(() => classifyAmount(expected, p, bad))).toBe('BAD_TOLERANCE');
      }
      expect([...seen].sort()).toEqual(['exact', 'over', 'partial', 'tolerated']);
    });
  }

  it('the tolerance never lets a payment through that is outside max(absolute, share), at the exact boundary', () => {
    for (const [expected, tol] of [[1000n, { absolute: 5n, bps: 100 }], [7n, { absolute: 0n, bps: 3333 }], [10n ** 30n, { absolute: 1n, bps: 1 }]] as const) {
      const edge = toleranceAmount(expected, tol);
      expect(classifyAmount(expected, expected - edge, tol)).toBe(edge === 0n ? 'exact' : 'tolerated');
      expect(classifyAmount(expected, expected + edge, tol)).toBe(edge === 0n ? 'exact' : 'tolerated');
      expect(classifyAmount(expected, expected + edge + 1n, tol)).toBe('over');
      if (expected - edge - 1n >= 0n) expect(classifyAmount(expected, expected - edge - 1n, tol)).toBe('partial');
    }
  });
});

interface Model { paid: bigint; txs: string[]; confirmed: Set<string>; moneyAfterClose: boolean }

function randomInvoice(r: Rand, n: number): Invoice {
  const issuedAt = int(r, 1000, 3000);
  return newInvoice({ nonce: nonce(n), chainId: pick(r, [8453, 10]), token: pick(r, [TOKEN, 'dai']), expected: 1n + big(r, 40), issuedAt, expiresAt: issuedAt + int(r, 0, 4000) });
}
function randomEvent(r: Rand, inv: Invoice, txId: () => number): InvoiceEvent {
  switch (int(r, 0, 9)) {
    case 0: return { type: 'suggest', txHash: hash(txId()) };
    case 1: return { type: 'expire', now: int(r, 0, 9000) };
    case 2: return { type: 'cancel' };
    case 3: return { type: 'sweep' };
    default: {
      const amount = r() < 0.3 ? inv.expected : r() < 0.3 ? 1n + big(r, 40) : inv.expected / BigInt(int(r, 1, 4)) + BigInt(int(r, 0, 2));
      const transfer: Transfer = {
        txHash: r() < 0.15 ? hash(1) : hash(txId()), chainId: r() < 0.9 ? inv.chainId : 1, token: r() < 0.9 ? inv.token : 'other',
        amount: amount === 0n ? 1n : amount, observedAt: int(r, 500, 9000),
      };
      return { type: 'payment', transfer, ...(r() < 0.4 ? { confirmed: true } : {}) };
    }
  }
}

describe('invoice state machine, seeded event sequences', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: 300 sequences never overstate payment state`, () => {
      const r = prng(seed);
      let applied = 0;
      let confirmedSeen = 0;
      let refused = 0;
      for (let s = 0; s < 300; s++) {
        let inv = randomInvoice(r, s);
        const tol: Tolerance = r() < 0.5 ? { absolute: 0n, bps: 0 } : { absolute: big(r, 20), bps: int(r, 0, 500) };
        const m: Model = { paid: 0n, txs: [], confirmed: new Set(), moneyAfterClose: false };
        let id = 100;
        for (let step = 0; step < 12; step++) {
          const ev = randomEvent(r, inv, () => id++);
          const before = inv;
          try {
            inv = transition(inv, ev, tol);
          } catch (e) {
            expect(e).toBeInstanceOf(FlowError);
            expect(inv).toBe(before); // a refused event changes nothing
            refused++;
            continue;
          }
          if (ev.type === 'payment' && inv !== before) {
            m.paid += ev.transfer.amount;
            m.txs.push(ev.transfer.txHash);
            if (ev.confirmed === true) m.confirmed.add(ev.transfer.txHash);
            applied++;
            // A closed invoice never takes money.
            expect(['cancelled', 'swept']).not.toContain(before.status);
          } else {
            expect(inv.paid).toBe(before.paid);
          }
          // Money is exactly what was applied, each transaction once.
          expect(inv.paid).toBe(m.paid);
          expect([...inv.txs]).toEqual(m.txs);
          expect(new Set(inv.txs).size).toBe(inv.txs.length);
          // Status never says more than the applied sum supports.
          if (inv.paid === 0n) {
            expect(['open', 'suggested', 'expired', 'cancelled']).toContain(inv.status);
          } else if (['partial', 'paid', 'overpaid', 'swept'].includes(inv.status) || (inv.status === 'expired' && inv.paid > 0n)) {
            const cls = classifyAmount(inv.expected, inv.paid, tol);
            if (inv.status === 'partial') expect(cls).toBe('partial');
            if (inv.status === 'paid') expect(['exact', 'tolerated']).toContain(cls);
            if (inv.status === 'overpaid') expect(cls).toBe('over');
          }
          // `confirmedTx` appears only through an event that carried confirmed: true, for an applied transaction.
          if (inv.confirmedTx !== undefined) {
            confirmedSeen++;
            expect(m.confirmed.has(inv.confirmedTx)).toBe(true);
            expect(inv.txs).toContain(inv.confirmedTx);
          }
          // A suggestion alone applies no money.
          if (inv.status === 'suggested') expect(inv.paid).toBe(0n);
          // Late money is flagged.
          if (ev.type === 'payment' && inv !== before && (ev.transfer.observedAt > inv.expiresAt || before.status === 'expired')) expect(inv.late).toBe(true);
        }
      }
      expect(applied).toBeGreaterThan(100);
      expect(confirmedSeen).toBeGreaterThan(20);
      expect(refused).toBeGreaterThan(100);
    });
  }

  it('reconcile never applies money or confirms: it only moves an open invoice to suggested, deterministically', () => {
    const run = (seed: number): string => {
      const r = prng(seed);
      const invoices = Array.from({ length: 6 }, (_, n) => randomInvoice(r, n));
      const transfers: Transfer[] = Array.from({ length: 12 }, (_, n) => {
        const inv = pick(r, invoices);
        return { txHash: hash(500 + n), chainId: inv.chainId, token: inv.token, amount: r() < 0.6 ? inv.expected : 1n + big(r, 40), observedAt: int(r, inv.issuedAt - 100, inv.expiresAt + 100) };
      });
      const tol: Tolerance = r() < 0.5 ? { absolute: 0n, bps: 0 } : { absolute: big(r, 8), bps: int(r, 0, 300) };
      const out = reconcile(invoices, transfers, tol);
      out.invoices.forEach((after, i) => {
        const before = invoices[i] as Invoice;
        expect(after.paid).toBe(before.paid);
        expect(after.txs).toEqual(before.txs);
        expect(after.confirmedTx).toBeUndefined();
        expect(after.status === before.status || (before.status === 'open' && after.status === 'suggested')).toBe(true);
      });
      // Shuffled input order gives the same result.
      expect(reconcile(invoices, [...transfers].reverse(), tol)).toEqual(out);
      // Malformed tolerance fails before anything is decided.
      expect(flowCode(() => reconcile(invoices, transfers, pick(r, MALFORMED) as Tolerance))).toBe('BAD_TOLERANCE');
      return JSON.stringify(out, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
    };
    for (let seed = 1; seed <= 150; seed++) run(seed);
    expect(run(742)).toBe(run(742));
  });
});
