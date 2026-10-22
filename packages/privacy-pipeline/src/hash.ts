import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Lowercase hex string without prefix unless stated. */
export type Hex = `0x${string}`;

/** Canonical JSON: sorted keys, bigint as decimal string, undefined omitted, finite numbers only. */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('non-finite number');
      return JSON.stringify(value);
    case 'bigint':
      return JSON.stringify(value.toString(10));
    case 'object': {
      if (Array.isArray(value))
        return `[${value.map((v) => canonical(v === undefined ? null : v)).join(',')}]`;
      const rec = value as Record<string, unknown>;
      const keys = Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError('unsupported value');
  }
}

/** sha256 of a UTF-8 string, `0x`-prefixed hex. */
export function sha256Hex(text: string): Hex {
  return `0x${bytesToHex(sha256(utf8ToBytes(text)))}`;
}
