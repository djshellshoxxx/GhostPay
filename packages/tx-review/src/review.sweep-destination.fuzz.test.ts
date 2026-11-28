// Seeded fuzz of the sweep destination rules (#745/WALLET-SAFETY-07): both sweep kinds refuse a destination that is a
// GhostPay contract or a token contract, whatever the address case, whichever chain's allowlist names it, and whichever
// token is swept. Expected reasons come from an independent oracle written here, never from review.ts. A fixed-seed
// local PRNG builds the same cases every run. Synthetic addresses only.
//
// Invariants: exact destination reason set (no miss, no false positive); `ok` only when none applies; the other intent
// kinds never gain a destination reason; reasons are unique and stable; the decode-then-review pipeline on bit-flipped
// sweep calldata and a hostile policy throws only typed errors.
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCER, CHAIN, DEST, EVIL_TOKEN, FEE_RECIPIENT, NOW, RELAYER, ROUTER, USDC,
  approve, buildTx, directSweep, permitSig, policy, relayedSweep, routerPayment,
} from './build.testutil.js';
import { decodeTx } from './decode.js';
import { TxReviewError } from './errors.js';
import { review } from './review.js';
import type { Address, Intent, ReasonCode, ReviewPolicy } from './types.js';

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

const addrOf = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}`;
/** Random casing of an address: review compares case-insensitively. */
function recase(r: Rand, a: string): Address {
  const body = a.slice(2).split('').map((c) => (r() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');
  return `0x${body}`;
}
const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const OTHER_CHAIN = 84532;
const TOKEN_POOL: readonly Address[] = [USDC, EVIL_TOKEN, addrOf(0x7001), addrOf(0x7002), addrOf(0x7003)];
const PLAIN_POOL: readonly Address[] = [DEST, addrOf(0x9001), addrOf(0x9002), addrOf(0xffff)];
const CONTRACTS: readonly Address[] = [ROUTER, RELAYER, ANNOUNCER];

interface Case { readonly policy: ReviewPolicy; readonly token: Address | 'native'; readonly destination: Address; readonly chainId: number }

function randomCase(r: Rand): Case {
  const listedHere = new Set<string>(TOKEN_POOL.filter(() => r() < 0.4).map((t) => t.toLowerCase()));
  if (r() < 0.8) listedHere.add(USDC.toLowerCase());
  // A token listed only on another chain must not make a destination a token contract here.
  const listedElsewhere = new Set<string>(TOKEN_POOL.filter(() => r() < 0.5).map((t) => t.toLowerCase()));
  const chainId = r() < 0.15 ? OTHER_CHAIN : CHAIN;
  const tokens = new Map<number, ReadonlySet<string>>([[CHAIN, listedHere], [OTHER_CHAIN, listedElsewhere]]);
  const token: Address | 'native' = r() < 0.25 ? 'native' : pick(r, TOKEN_POOL);
  const bucket = int(r, 0, 5);
  const destination = bucket === 0 ? pick(r, CONTRACTS) : bucket === 1 ? pick(r, TOKEN_POOL) : bucket === 2 && token !== 'native' ? token : pick(r, PLAIN_POOL);
  return { policy: policy({ tokens }), token, destination: recase(r, destination), chainId };
}

/** Independent oracle: the two destination reasons, from the rules as the directive states them. */
function oracle(c: Case): readonly ReasonCode[] {
  const out: ReasonCode[] = [];
  if (CONTRACTS.some((x) => eq(x, c.destination))) out.push('DESTINATION_IS_PROTOCOL_CONTRACT');
  const listed = c.policy.tokens.get(c.chainId);
  const tokenContract = (c.token !== 'native' && eq(c.token, c.destination)) || (listed !== undefined && [...listed].some((t) => eq(t, c.destination)));
  if (tokenContract) out.push('DESTINATION_IS_TOKEN_CONTRACT');
  return out;
}
const destinationReasons = (reasons: readonly ReasonCode[]): ReasonCode[] =>
  reasons.filter((x) => x === 'DESTINATION_IS_PROTOCOL_CONTRACT' || x === 'DESTINATION_IS_TOKEN_CONTRACT');
const reasonsOf = (i: Intent, p: ReviewPolicy): readonly ReasonCode[] => {
  const result = review(i, i, p, NOW, { paymentGross: 1_000_000_000n });
  return result.ok ? [] : result.reasons;
};

const SEEDS = [4, 1969, 20261125];
const ITERATIONS = 700;

describe('sweep destination rules, seeded fuzz against an independent oracle', () => {
  for (const seed of SEEDS) {
    it(`seed ${String(seed)}: ${String(ITERATIONS)} direct and relayed sweeps get exactly the oracle's destination reasons`, () => {
      const r = prng(seed);
      let protocol = 0;
      let tokenContract = 0;
      let clean = 0;
      for (let i = 0; i < ITERATIONS; i++) {
        const c = randomCase(r);
        const direct = directSweep({ chainId: c.chainId, token: c.token, to: c.destination, ...(c.token === 'native' ? { amount: 10n ** 18n } : {}) });
        const relayed = relayedSweep({ chainId: c.chainId, token: c.token === 'native' ? USDC : c.token, destination: c.destination });
        // The relayed sweep never carries native: its token slot is USDC then, and the oracle must judge that token.
        for (const [intent, token] of [[direct, c.token], [relayed, relayed.token]] as const) {
          const expected = oracle({ ...c, token });
          const reasons = reasonsOf(intent, c.policy);
          // Exactly the destination reasons the oracle expects, each once, protocol before token (stable order).
          expect(destinationReasons(reasons), `seed ${String(seed)} #${String(i)} ${intent.kind}`).toEqual(expected);
          expect(new Set(reasons).size).toBe(reasons.length);
          // Fail closed: when a destination reason applies the verdict is never ok.
          if (expected.length > 0) expect(reasons.length).toBeGreaterThan(0);
          if (expected.includes('DESTINATION_IS_PROTOCOL_CONTRACT')) protocol++;
          if (expected.includes('DESTINATION_IS_TOKEN_CONTRACT')) tokenContract++;
          if (expected.length === 0) clean++;
        }
        // The swept token's own contract is refused for either sweep, listed or not.
        if (c.token !== 'native' && eq(c.destination, c.token)) {
          expect(reasonsOf(direct, c.policy)).toContain('DESTINATION_IS_TOKEN_CONTRACT');
          expect(reasonsOf(relayed, c.policy)).toContain('DESTINATION_IS_TOKEN_CONTRACT');
        }
      }
      expect(protocol).toBeGreaterThan(40);
      expect(tokenContract).toBeGreaterThan(40);
      expect(clean).toBeGreaterThan(40);
    });
  }

  it('other intent kinds never gain a destination reason, whatever the policy lists', () => {
    const r = prng(99);
    for (let i = 0; i < 200; i++) {
      const c = randomCase(r);
      for (const intent of [routerPayment(), approve(), permitSig(), routerPayment({ token: 'native', gross: 10n ** 18n })]) {
        expect(destinationReasons(reasonsOf(intent, c.policy))).toEqual([]);
      }
    }
  });

  it('an ok sweep never targets a protocol or token contract (the mirror property)', () => {
    const r = prng(5);
    let ok = 0;
    for (let i = 0; i < 600; i++) {
      const c = randomCase(r);
      const direct = directSweep({ chainId: c.chainId, token: c.token, to: c.destination, ...(c.token === 'native' ? { amount: 10n ** 18n } : {}) });
      const result = review(direct, direct, c.policy, NOW);
      if (result.ok) {
        ok++;
        expect(CONTRACTS.some((x) => eq(x, c.destination))).toBe(false);
        expect(c.token !== 'native' && eq(c.token, c.destination)).toBe(false);
        expect([...(c.policy.tokens.get(c.chainId) ?? [])].some((t) => eq(t, c.destination))).toBe(false);
      }
    }
    expect(ok).toBeGreaterThan(20);
  });

  it('decode then review on bit-flipped sweep calldata and hostile policies throws only typed errors', () => {
    const r = prng(31);
    const base = buildTx(directSweep());
    const bytes = base.data.slice(2).match(/../g) as string[];
    let reviewed = 0;
    for (let i = 0; i < 300; i++) {
      const copy = [...bytes];
      for (let k = 0; k < int(r, 1, 3); k++) {
        const at = int(r, 0, copy.length - 1);
        copy[at] = (Number.parseInt(copy[at] as string, 16) ^ (1 << int(r, 0, 7))).toString(16).padStart(2, '0');
      }
      const tx = { ...base, data: `0x${copy.join('')}`, ...(r() < 0.3 ? { to: recase(r, base.to) } : {}) };
      const hostilePolicy: ReviewPolicy = r() < 0.2
        ? policy({ feeRecipient: FEE_RECIPIENT, maxDeadlineSeconds: pick(r, [0, -1, 1.5, 3600]) })
        : randomCase(r).policy;
      try {
        const decoded = decodeTx(tx);
        review(decoded, directSweep(), hostilePolicy, NOW);
        reviewed++;
      } catch (e) {
        expect(e).toBeInstanceOf(TxReviewError);
      }
    }
    expect(reviewed).toBeGreaterThan(20);
  });

  it('is deterministic: the same seed yields the same verdicts', () => {
    const run = (seed: number): string[] => {
      const r = prng(seed);
      return Array.from({ length: 80 }, () => {
        const c = randomCase(r);
        return reasonsOf(directSweep({ chainId: c.chainId, token: c.token, to: c.destination, ...(c.token === 'native' ? { amount: 10n ** 18n } : {}) }), c.policy).join(',');
      });
    };
    expect(run(2026)).toEqual(run(2026));
  });
});
