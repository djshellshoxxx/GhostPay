/**
 * Uniform float in [0, 1) from the platform CSPRNG (`Math.random` is banned
 * repo-wide, ADR-0004). Used only for output/input positioning privacy, never
 * for key material.
 */
export function secureUnit(): number {
  const c = (globalThis as { crypto?: Pick<Crypto, 'getRandomValues'> }).crypto;
  if (c === undefined) throw new Error('crypto.getRandomValues unavailable');
  const b = new Uint32Array(1);
  c.getRandomValues(b);
  return (b[0] as number) / 2 ** 32;
}
