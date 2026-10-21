const HEX_RE = /^(?:[0-9a-f]{2})*$/;

/** Lowercase hex of bytes. */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Strict hex decoder: optional `0x`, surrounding whitespace trimmed, case-insensitive.
 * @returns bytes, or `undefined` when not even-length hex. Never throws, never echoes input.
 */
export function fromHex(text: string): Uint8Array | undefined {
  let s = text.trim().toLowerCase();
  if (s.startsWith('0x')) s = s.slice(2);
  if (!HEX_RE.test(s)) return undefined;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
