import type { Clock, RandomBytes } from './chain.js';

/** Deterministic counter-based rng (fake, tests only). */
export function seededRng(seed = 1): RandomBytes {
  let s = seed >>> 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      out[i] = s >>> 24;
    }
    return out;
  };
}

/** Manual clock. */
export function manualClock(start = 1_000_000): {
  clock: Clock;
  set: (t: number) => void;
  adv: (d: number) => void;
} {
  let t = start;
  return {
    clock: () => t,
    set: (v) => {
      t = v;
    },
    adv: (d) => {
      t += d;
    },
  };
}
