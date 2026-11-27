// W5 independent payment-state verifier: seeded deterministic PRNG (mulberry32 algorithm, public-domain construction
// by Tommy Ettinger, re-implemented here) and helpers. Every random choice in a run derives from one recorded seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }
  /** 32-byte lowercase hex string (used for synthetic transaction hashes). */
  hash32() {
    let s = '0x';
    for (let i = 0; i < 8; i += 1) s += Math.floor(this.next() * 2 ** 32).toString(16).padStart(8, '0');
    return s;
  }
}
