import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;

function uintBytes(value: bigint, width: number): Uint8Array {
  const out = new Uint8Array(width);
  let v = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * Injective tag-length-value encoder used for every signed digest.
 *
 * @remarks Each field is `tag (1 byte) || length (u32 BE) || bytes`. Because every
 * field carries its own tag and length, two different field sequences can never
 * produce the same byte string (no concatenation ambiguity). Callers only pass
 * values that were already validated, so range checks here are assertions.
 */
export class TlvEncoder {
  private readonly parts: Uint8Array[] = [];

  /** Appends a raw byte field. */
  public bytes(tag: number, value: Uint8Array): this {
    const header = new Uint8Array(5);
    header[0] = tag;
    new DataView(header.buffer).setUint32(1, value.length, false);
    this.parts.push(header, value);
    return this;
  }

  /** Appends a UTF-8 string field. */
  public str(tag: number, value: string): this {
    return this.bytes(tag, utf8ToBytes(value));
  }

  /** Appends an unsigned 64-bit big-endian integer field. */
  public u64(tag: number, value: bigint): this {
    if (value < 0n || value > U64_MAX) throw new RangeError('u64 out of range');
    return this.bytes(tag, uintBytes(value, 8));
  }

  /** Appends an unsigned 256-bit big-endian integer field. */
  public u256(tag: number, value: bigint): this {
    if (value < 0n || value > U256_MAX) throw new RangeError('u256 out of range');
    return this.bytes(tag, uintBytes(value, 32));
  }

  /** Returns the concatenated encoding. */
  public finish(): Uint8Array {
    return concatBytes(...this.parts);
  }
}

export { U64_MAX, U256_MAX };
