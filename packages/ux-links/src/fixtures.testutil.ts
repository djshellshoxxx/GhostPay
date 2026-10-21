/** Fake, non-real test data only. */
export const META_A = `st:eth:0x${'02'.padEnd(66, 'ab')}${'03'.padEnd(66, 'cd')}`;
export const META_B = `st:eth:0x${'02'.padEnd(66, '12')}${'03'.padEnd(66, '34')}`;
export const META_C = `st:eth:0x${'03'.padEnd(66, '56')}${'02'.padEnd(66, '78')}`;
export const SECRET = 'AAAAAAAAAAAAAAAAAAAAAA'; // 22 chars fake
export const NOW = 1_800_000_000;
export const fixedRng = (fill: number) => (n: number) => new Uint8Array(n).fill(fill);
export function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'NON_LINKERROR';
  }
  return undefined;
}
