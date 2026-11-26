// W5 independent payment-state verifier: milestone 2 seller scenarios (bounded, deterministic).
// Original work. X (0.5 ETH) and C (0.3 ETH, unrelated control) are both registered; payments come from the real
// payer checkout (or, for late payments, the same call sent directly to the router with a later deadline, S37).
import { Rng } from './prng.mjs';

const FINAL = 100; // finalityDepth for 84532

export const SELLER_NAMED = [
  {
    name: 'M1-pending-then-final-confirm',
    why: 'S9/S1: a payment short of finality is not paid; once final it is only proposed; the seller confirm links it once',
    steps: [
      { op: 'pay', intent: 'X' },
      { op: 'scan', tab: 'S1' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1' },
      { op: 'confirm', tab: 'S1', intent: 'X', must: true },
      { op: 'scan', tab: 'S1' },
      { op: 'scan', tab: 'S1', fromStart: true },
      { op: 'compareTabs' },
    ],
  },
  {
    name: 'M2-final-but-unconfirmed',
    why: 'S1/S7: a final exact match is a proposal; without the seller decision the invoice is not paid, across reloads',
    steps: [
      { op: 'pay', intent: 'X' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1' },
      { op: 'reload', tab: 'S1' },
      { op: 'scan', tab: 'S2' },
    ],
  },
  {
    name: 'M3-reorg-after-link',
    why: 'S14/S16/S18: a reorg that removes the linked payment withdraws the link at the next scan and keeps evidence',
    steps: [
      { op: 'pay', intent: 'X' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1' },
      { op: 'confirm', tab: 'S1', intent: 'X', must: true },
      { op: 'reorg', depth: FINAL + 3, drop: true },
      { op: 'advance', n: 2 },
      { op: 'scan', tab: 'S1' },
      { op: 'reload', tab: 'S1' },
      { op: 'scan', tab: 'S1' },
      { op: 'compareTabs' },
    ],
  },
  {
    name: 'M4-late-accept-then-reorg',
    why: 'S9/S10/S13/S14: a late payment never links by ordinary confirm; accept-late links it; a reorg withdraws credit and keeps the decision time',
    xHours: 1,
    steps: [
      { op: 'pay', intent: 'X', capture: true },
      { op: 'warp', seconds: 2 * 3600 },
      { op: 'directPay', intent: 'X' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1' },
      { op: 'confirm', tab: 'S1', intent: 'X' }, // must NOT link a late payment (SI3); a missing button is the expected outcome
      { op: 'acceptLate', tab: 'S1', intent: 'X', must: true },
      { op: 'scan', tab: 'S1' },
      { op: 'reorg', depth: FINAL + 3, drop: true },
      { op: 'advance', n: 2 },
      { op: 'scan', tab: 'S1' },
      { op: 'reload', tab: 'S1' },
    ],
  },
  {
    name: 'M5-rpc-down-mid-scan',
    why: 'S20/S25/S27: an interrupted scan adds no credit; a clean rescan proposes the payment',
    steps: [
      { op: 'pay', intent: 'X' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1', failAfterCalls: 6 }, // expected to fail
      { op: 'confirm', tab: 'S1', intent: 'X' },
      { op: 'scan', tab: 'S1' },
      { op: 'confirm', tab: 'S1', intent: 'X', must: true },
      { op: 'scan', tab: 'S1' },
    ],
  },
  {
    name: 'M6-two-seller-tabs-confirm-race',
    why: 'S39/S27: confirming in both seller tabs links the payment once and both tabs agree after reload',
    steps: [
      { op: 'pay', intent: 'X' },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1' },
      { op: 'scan', tab: 'S2', fromStart: true },
      { op: 'confirm', tab: 'S1', intent: 'X', must: true },
      { op: 'confirm', tab: 'S2', intent: 'X' }, // stale second tab: may be refused (S7/S39); must not double-link
      { op: 'compareTabs' },
      { op: 'scan', tab: 'S2', fromStart: true },
      { op: 'compareTabs' },
    ],
  },
];

/** Positive controls: conditions outside the accepted guarantee under which the oracle must fire. */
export const SELLER_CONTROLS = [
  {
    name: 'P2-control-stale-rpc-hides-reorg',
    why: 'outside the trust boundary (RS:25, single RPC): the RPC keeps serving the orphaned fork, so the app keeps the link; SI4 must fire',
    expectViolations: ['SI4'],
    steps: [
      { op: 'pay', intent: 'X', must: true },
      { op: 'advance', n: FINAL },
      { op: 'scan', tab: 'S1', must: true },
      { op: 'confirm', tab: 'S1', intent: 'X', must: true },
      { op: 'reorg', depth: FINAL + 3, drop: true, hideFromRpc: true },
      { op: 'scan', tab: 'S1', must: true },
    ],
  },
];

/** Seeded sequences over the same alphabet (bounded: 4–8 steps after a fixed payment prefix). */
export function sellerGenerated(seed) {
  const rng = new Rng(seed);
  const steps = [{ op: 'pay', intent: 'X' }];
  const n = rng.int(4, 8);
  for (let i = 0; i < n; i += 1) {
    const r = rng.next();
    const tab = rng.pick(['S1', 'S2']);
    if (r < 0.25) steps.push({ op: 'scan', tab, fromStart: rng.next() < 0.3 });
    else if (r < 0.4) steps.push({ op: 'advance', n: rng.pick([1, 50, FINAL]) });
    else if (r < 0.55) steps.push({ op: 'confirm', tab, intent: 'X' });
    else if (r < 0.62) steps.push({ op: 'reorg', depth: rng.pick([2, FINAL + 3]), drop: rng.next() < 0.5 });
    else if (r < 0.7) steps.push({ op: 'mine' });
    else if (r < 0.78) steps.push({ op: 'reload', tab });
    else if (r < 0.85) steps.push({ op: 'scan', tab, failAfterCalls: rng.int(2, 12) });
    else if (r < 0.92) steps.push({ op: 'pay', intent: 'C' });
    else steps.push({ op: 'compareTabs' });
  }
  steps.push({ op: 'advance', n: FINAL }, { op: 'scan', tab: 'S1' }, { op: 'compareTabs' });
  return { name: `SG-${seed}`, why: 'seeded seller interleaving', seed, steps };
}
