const MASK = (1n << 64n) - 1n;

function splitmix(state: bigint): [bigint, bigint] {
  const s = (state + 0x9e3779b97f4a7c15n) & MASK;
  let z = s;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return [s, z ^ (z >> 31n)];
}

/**
 * Deterministic 256-bit mock hash (splitmix64 based) as `0x` + 64 hex.
 *
 * @remarks NOT cryptographic. It exists only to give mock blocks and txs stable,
 * unique-looking identifiers. Never use it for anything security relevant.
 */
export function mockHash(input: string): string {
  let state = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    state = ((state ^ BigInt(input.charCodeAt(i))) * 0x100000001b3n) & MASK;
    state = splitmix(state)[0];
  }
  let out = '';
  for (let i = 0; i < 4; i++) {
    const [next, value] = splitmix(state);
    state = next;
    out += value.toString(16).padStart(16, '0');
  }
  return `0x${out}`;
}

/** Deterministic mock 20-byte address derived from a label. Not a real key. */
export function mockAddress(label: string): string {
  return `0x${mockHash(`addr:${label}`).slice(2, 42)}`;
}
