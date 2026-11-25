// W5 independent payment-state verifier: bounded deterministic event sequences.
// Original work. A sequence = fixed prefix (start a payment of X in tab A) + bounded random middle + fixed suffix
// (judgement: retry X in both tabs, pay control C once, explicit status checks). Named scenarios cover the milestone's
// required cases directly; the seeded generator explores interleavings around them.
import { Rng } from './prng.mjs';

export const SEND_BEHAVIOURS = ['ok', 'hang-broadcast', 'hang-nobroadcast', 'error-after-broadcast', 'reject'];

/** Judgement suffix shared by every sequence: the safety properties are exercised from every reached state. */
export const SUFFIX = [
  { op: 'release' },
  { op: 'rpc', mode: 'up' },
  { op: 'chain', to: 'invoice' },
  { op: 'open', tab: 'A', intent: 'X' },
  { op: 'check', tab: 'A', intent: 'X' },
  { op: 'send', tab: 'A', behaviour: 'ok' }, // must be refused while X has a record (I2)
  { op: 'open', tab: 'B', intent: 'X' },
  { op: 'send', tab: 'B', behaviour: 'ok' }, // must be refused in the other tab too (I6)
  { op: 'open', tab: 'B', intent: 'C' },
  { op: 'send', tab: 'B', behaviour: 'ok', mineOnSubmit: true }, // control must reach the wallet exactly once (I7)
  { op: 'mine' },
  { op: 'check', tab: 'B', intent: 'X' },
];

export const NAMED = [
  {
    name: 'N1-interrupt-before-hash-tab-closed',
    why: 'R3/R5/R4: wallet prompt started, no hash, tab closed; reopen and other tab must stay blocked; unrelated C pays',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'hang-broadcast' },
      { op: 'closeReopen', tab: 'A' },
      { op: 'mine' },
    ],
  },
  {
    name: 'N2-hash-returned-reload-reorg',
    why: 'R3/R19/R36/R41: hash returned then reload; inclusion then reorg must drop "included" but keep the hash',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'ok' },
      { op: 'reload', tab: 'A' },
      { op: 'mine' },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'check', tab: 'B', intent: 'X' },
      { op: 'reorg', depth: 1 },
      { op: 'check', tab: 'B', intent: 'X' },
      { op: 'reload', tab: 'B' },
    ],
  },
  {
    name: 'N3-error-after-broadcast-then-mined',
    why: 'R12/R13: wallet errors after broadcasting; the transaction is mined anyway; no success, no automatic retry',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'error-after-broadcast' },
      { op: 'mine' },
      { op: 'reload', tab: 'A' },
    ],
  },
  {
    name: 'N4-override-dismissed-then-accepted',
    why: 'R25: dismissing the clear dialog keeps the block; accepting it permits exactly one further wallet request',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'hang-nobroadcast' },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'clear', tab: 'B', intent: 'X', accept: false },
      { op: 'send', tab: 'B', behaviour: 'ok' },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'clear', tab: 'B', intent: 'X', accept: true },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'send', tab: 'B', behaviour: 'ok' },
      { op: 'mine' },
    ],
  },
  {
    name: 'N5-late-hash-after-account-switch',
    why: 'R28/R33: account changes while the wallet holds the reply; the late hash is evidence, not new authority',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'hang-broadcast' },
      { op: 'account' },
      { op: 'release' },
      { op: 'wait', ms: 2500 },
      { op: 'mine' },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'send', tab: 'B', behaviour: 'ok' },
    ],
  },
  {
    name: 'N6-rpc-down-on-reload',
    why: 'R3/R14: hash returned, RPC unavailable after reload; verification incomplete, never success, no retry',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'ok' },
      { op: 'rpc', mode: 'down' },
      { op: 'reload', tab: 'A' },
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'check', tab: 'A', intent: 'X' },
    ],
  },
  {
    name: 'N7-chain-switch-after-prepare',
    why: 'R28/R29: wallet moves to another chain after the final check; nothing may reach the wallet on the wrong chain',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'chain', to: 'other' },
      { op: 'send', tab: 'A', behaviour: 'ok' },
      { op: 'chain', to: 'invoice' },
    ],
  },
  {
    name: 'N8-included-then-reorg-done-panel',
    why: 'R36/R41/A1: checkout shows inclusion, a reorg removes it; recheck and reload must not keep it included',
    steps: [
      { op: 'open', tab: 'A', intent: 'X', mineOnSubmit: true },
      { op: 'send', tab: 'A', behaviour: 'ok', mineOnSubmit: true },
      { op: 'reorg', depth: 2 },
      { op: 'drop' },
      { op: 'check', tab: 'A', intent: 'X' },
      { op: 'reload', tab: 'A' },
    ],
  },
  {
    name: 'N9-late-hash-after-in-page-invoice-switch',
    why: 'R28/R29/R42: tab switches to control C in-page while X waits in the wallet; the late X hash must stay X evidence, never C status, and C still pays once',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'hang-broadcast' },
      { op: 'switchInPage', tab: 'A', intent: 'C' },
      { op: 'release' },
      { op: 'mine' },
      { op: 'send', tab: 'A', behaviour: 'ok' },
      { op: 'check', tab: 'A', intent: 'X' },
    ],
  },
  {
    name: 'N10-one-clear-two-tabs-race',
    why: 'R25/R19: one deliberate clear authorizes at most one further wallet request across both tabs',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'error-after-broadcast' },
      { op: 'open', tab: 'B', intent: 'X' },
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'clear', tab: 'B', intent: 'X', accept: true },
      { op: 'send', tab: 'A', behaviour: 'hang-broadcast' },
      { op: 'send', tab: 'B', behaviour: 'ok' },
      { op: 'release' },
      { op: 'mine' },
    ],
  },
  {
    name: 'N11-browser-restart-after-hash',
    why: 'R19/R3: hash returned, then the whole browser restarts; the hash survives and no tab may pay X again',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'ok' },
      { op: 'restart' },
      { op: 'mine' },
    ],
  },
  {
    name: 'N12-browser-restart-before-hash',
    why: 'R5/R12: wallet prompt open, browser restarts (reply lost); the unknown record survives and blocks repeats',
    steps: [
      { op: 'open', tab: 'A', intent: 'X' },
      { op: 'send', tab: 'A', behaviour: 'hang-broadcast' },
      { op: 'restart' },
      { op: 'mine' },
    ],
  },
];

/** Random middle step alphabet with weights; every op is bounded (no unbounded waits or loops). */
function randomStep(rng) {
  const r = rng.next();
  const tab = rng.pick(['A', 'B']);
  if (r < 0.13) return { op: 'open', tab, intent: rng.next() < 0.8 ? 'X' : 'C' };
  if (r < 0.16) return { op: 'switchInPage', tab, intent: rng.pick(['X', 'C']) };
  if (r < 0.32) return { op: 'send', tab, behaviour: rng.pick(SEND_BEHAVIOURS) };
  if (r < 0.42) return { op: 'mine' };
  if (r < 0.48) return { op: 'reorg', depth: rng.int(1, 3) };
  if (r < 0.52) return { op: 'drop' };
  if (r < 0.58) return { op: 'rpc', mode: rng.pick(['down', 'up']) };
  if (r < 0.66) return { op: 'reload', tab };
  if (r < 0.72) return { op: 'closeReopen', tab };
  if (r < 0.76) return { op: 'account' };
  if (r < 0.79) return { op: 'chain', to: rng.pick(['other', 'invoice']) };
  if (r < 0.85) return { op: 'release' };
  if (r < 0.90) return { op: 'clear', tab, intent: 'X', accept: rng.next() < 0.5 };
  if (r < 0.93) return { op: 'restart' };
  return { op: 'check', tab, intent: 'X' };
}

export function generated(seed, { minSteps = 4, maxSteps = 8 } = {}) {
  const rng = new Rng(seed);
  const n = rng.int(minSteps, maxSteps);
  const steps = [
    { op: 'open', tab: 'A', intent: 'X' },
    { op: 'send', tab: 'A', behaviour: rng.pick(SEND_BEHAVIOURS) },
  ];
  for (let i = 0; i < n; i += 1) steps.push(randomStep(rng));
  return { name: `G-${seed}`, why: 'seeded interleaving', seed, steps };
}
