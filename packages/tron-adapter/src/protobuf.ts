import { fail } from './errors.js';

/**
 * Minimal protobuf wire encoder/decoder: just enough for TRON `Transaction.raw`, `Any` and the
 * Transfer/TriggerSmartContract messages. Justification vs `tronweb`: see ADR-0019 section 4.
 */

/** @internal */
export function varint(value: bigint | number): Uint8Array {
  let v = BigInt(value);
  if (v < 0n || v >= 1n << 64n) fail('INVALID_PROTOBUF');
  const out: number[] = [];
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  return Uint8Array.from(out);
}

/** @internal */
export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** @internal Field with varint value (wire type 0). Zero is omitted (proto3). */
export function fVarint(field: number, value: bigint | number): Uint8Array {
  if (BigInt(value) === 0n) return new Uint8Array(0);
  return concat(varint(field << 3), varint(value));
}

/** @internal Field with length-delimited value (wire type 2). Empty is omitted (proto3). */
export function fBytes(field: number, value: Uint8Array): Uint8Array {
  if (value.length === 0) return new Uint8Array(0);
  return concat(varint((field << 3) | 2), varint(value.length), value);
}

/** A decoded protobuf field. */
export interface PbField {
  readonly field: number;
  readonly wire: 0 | 2;
  readonly varint?: bigint;
  readonly bytes?: Uint8Array;
}

/** @internal Strict decode; only wire types 0 and 2; throws on truncation or overflow. */
export function decodeFields(buf: Uint8Array): PbField[] {
  const out: PbField[] = [];
  let i = 0;
  const readVarint = (): bigint => {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const b = buf[i++];
      if (b === undefined) return fail('INVALID_PROTOBUF');
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) {
        if (result >= 1n << 64n) return fail('INVALID_PROTOBUF');
        return result;
      }
    }
    return fail('INVALID_PROTOBUF');
  };
  while (i < buf.length) {
    const key = readVarint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field === 0) return fail('INVALID_PROTOBUF');
    if (wire === 0) {
      out.push({ field, wire: 0, varint: readVarint() });
    } else if (wire === 2) {
      const len = Number(readVarint());
      if (i + len > buf.length) return fail('INVALID_PROTOBUF');
      out.push({ field, wire: 2, bytes: buf.subarray(i, i + len) });
      i += len;
    } else {
      return fail('INVALID_PROTOBUF');
    }
  }
  return out;
}
