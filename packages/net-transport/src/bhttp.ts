import { NetTransportError } from './errors.js';

/** A binary HTTP request (RFC 9292 known-length form). */
export interface BhttpRequest {
  /** Method, e.g. `POST`. */
  readonly method: string;
  /** Scheme, e.g. `https`. */
  readonly scheme: string;
  /** Authority (`host[:port]`). */
  readonly authority: string;
  /** Path plus query. */
  readonly path: string;
  /** Header fields (lower-case names). */
  readonly headers: readonly (readonly [string, string])[];
  /** Body. */
  readonly content: Uint8Array;
}

/** A binary HTTP response (final status only; interim 1xx are skipped on decode). */
export interface BhttpResponse {
  /** Final status code (200-599). */
  readonly status: number;
  /** Header fields. */
  readonly headers: readonly (readonly [string, string])[];
  /** Body. */
  readonly content: Uint8Array;
}

const MAX_FIELD = 1 << 20;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/**
 * Encodes a QUIC-style variable-length integer (RFC 9000 section 16), as used by RFC 9292.
 *
 * @param v Integer in `[0, 2^30)` (larger values are not needed here and are rejected).
 */
export function encodeVarint(v: number): Uint8Array {
  if (!Number.isInteger(v) || v < 0 || v >= 2 ** 30) throw new NetTransportError('OHTTP_FRAMING', 'varint out of range');
  if (v < 64) return Uint8Array.of(v);
  if (v < 16384) return Uint8Array.of(0x40 | (v >> 8), v & 0xff);
  return Uint8Array.of(0x80 | (v >>> 24), (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

class Cursor {
  public pos = 0;
  public constructor(private readonly b: Uint8Array) {}
  public get left(): number {
    return this.b.length - this.pos;
  }
  public varint(): number {
    if (this.left < 1) throw framing();
    const first = this.b[this.pos] as number;
    const len = 1 << (first >> 6);
    if (this.left < len) throw framing();
    if (len === 8) throw framing(); // 62-bit lengths are far beyond any sane message
    let v = first & 0x3f;
    for (let i = 1; i < len; i++) v = v * 256 + (this.b[this.pos + i] as number);
    this.pos += len;
    return v;
  }
  public bytes(n: number): Uint8Array {
    if (n > this.left) throw framing();
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  public lp(): Uint8Array {
    const n = this.varint();
    if (n > MAX_FIELD) throw framing();
    return this.bytes(n);
  }
  public str(): string {
    try {
      return dec.decode(this.lp());
    } catch {
      throw framing();
    }
  }
  public allZeroRest(): boolean {
    for (let i = this.pos; i < this.b.length; i++) if (this.b[i] !== 0) return false;
    return true;
  }
}

function framing(): NetTransportError {
  return new NetTransportError('OHTTP_FRAMING', 'malformed binary HTTP message');
}

function cat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function lp(b: Uint8Array): Uint8Array {
  return cat([encodeVarint(b.length), b]);
}

function fields(h: readonly (readonly [string, string])[]): Uint8Array {
  const inner = cat(h.flatMap(([k, v]) => [lp(enc.encode(k)), lp(enc.encode(v))]));
  return lp(inner);
}

function readFields(c: Cursor): [string, string][] {
  const sec = new Cursor(c.lp());
  const out: [string, string][] = [];
  while (sec.left > 0) out.push([sec.str(), sec.str()]);
  return out;
}

/**
 * Encodes a known-length binary HTTP request (framing indicator 0).
 *
 * @param r Request.
 * @param padTo Optional: pad with zero bytes up to a multiple of this size (RFC 9292 padding).
 */
export function encodeBhttpRequest(r: BhttpRequest, padTo = 0): Uint8Array {
  const body = cat([
    Uint8Array.of(0),
    lp(enc.encode(r.method)),
    lp(enc.encode(r.scheme)),
    lp(enc.encode(r.authority)),
    lp(enc.encode(r.path)),
    fields(r.headers),
    lp(r.content),
    encodeVarint(0), // empty trailer section
  ]);
  if (padTo <= 0) return body;
  const padded = Math.ceil(body.length / padTo) * padTo;
  return cat([body, new Uint8Array(padded - body.length)]);
}

/**
 * Decodes a known-length binary HTTP request. Indeterminate-length messages (framing 2) are rejected.
 *
 * @throws {NetTransportError} `OHTTP_FRAMING`.
 */
export function decodeBhttpRequest(b: Uint8Array): BhttpRequest {
  const c = new Cursor(b);
  if (c.varint() !== 0) throw framing();
  const method = c.str();
  const scheme = c.str();
  const authority = c.str();
  const path = c.str();
  const headers = readFields(c);
  const content = c.lp();
  readFields(c); // trailers: parsed for well-formedness, ignored
  if (!c.allZeroRest()) throw framing();
  return { method, scheme, authority, path, headers, content };
}

/** Encodes a known-length binary HTTP response (framing indicator 1). */
export function encodeBhttpResponse(r: BhttpResponse, padTo = 0): Uint8Array {
  const body = cat([Uint8Array.of(1), encodeVarint(r.status), fields(r.headers), lp(r.content), encodeVarint(0)]);
  if (padTo <= 0) return body;
  return cat([body, new Uint8Array(Math.ceil(body.length / padTo) * padTo - body.length)]);
}

/**
 * Decodes a known-length binary HTTP response, skipping interim (1xx) responses.
 *
 * @throws {NetTransportError} `OHTTP_FRAMING`.
 */
export function decodeBhttpResponse(b: Uint8Array): BhttpResponse {
  const c = new Cursor(b);
  if (c.varint() !== 1) throw framing();
  let status = c.varint();
  while (status >= 100 && status <= 199) {
    readFields(c);
    status = c.varint();
  }
  if (status < 200 || status > 599) throw framing();
  const headers = readFields(c);
  const content = c.lp();
  readFields(c);
  if (!c.allZeroRest()) throw framing();
  return { status, headers, content };
}
