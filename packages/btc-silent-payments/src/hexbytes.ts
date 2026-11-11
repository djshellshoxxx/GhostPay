/** Internal hex helpers for header code (not exported from the package). */

const BYTE_HEX: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * Lower-case hex. Built with `join` so the result is one flat string (`+=` would leave a rope of tiny pieces that
 * stays in memory as long as the string does).
 */
export function toHex(b: Uint8Array): string {
  const parts = new Array<string>(b.length);
  for (let i = 0; i < b.length; i++) parts[i] = BYTE_HEX[b[i] as number] as string;
  return parts.join('');
}

/** Even-length hex (already validated by the caller) to bytes. */
export function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}
