import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { PirError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { buildManifest, type Manifest } from './manifest.js';

/** Smallest accepted page size in bytes. */
export const MIN_PAGE_BYTES = 256;
/** Largest accepted page size in bytes. */
export const MAX_PAGE_BYTES = 1 << 20;
/** Default page size (4 KiB, spec 4.8). */
export const DEFAULT_PAGE_BYTES = 4096;

const FIXED = 8 + 8 + 4 + 32 + 20 + 20 + 33; // fixed part of a record
const RECORD_HEADER = FIXED + 2; // plus u16 metadata length
const PAGE_HEADER = 2; // u16 record count
const LEN_PREFIX = 2; // u16 per-record length

/** Public announcement fields stored in a page. Structurally a subset of chain-adapters' `ScannedAnnouncement`. */
export interface PackableAnnouncement {
  readonly schemeId: bigint;
  /** 0x-hex, 20 bytes. */
  readonly stealthAddress: string;
  /** 0x-hex, 20 bytes. */
  readonly caller: string;
  /** 0x-hex, 33 bytes. */
  readonly ephemeralPublicKey: string;
  /** 0x-hex, any even length up to 65 535 bytes (view tag is metadata byte 0). */
  readonly metadata: string;
  readonly blockNumber: bigint;
  /** 0x-hex, 32 bytes. */
  readonly blockHash: string;
  readonly logIndex: number;
}

/** Shard description: which blocks of which chain the pages cover. */
export interface Shard {
  readonly chainId: number;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  /** 0x-hex hash of block `toBlock`, published in the manifest for the third-source check. Optional. */
  readonly headHash?: string;
}

const U64_MAX = (1n << 64n) - 1n;

function fixedHex(s: string, len: number): Uint8Array {
  if (typeof s !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(s) || s.length !== 2 + 2 * len) {
    throw new PirError('INVALID_ARGUMENT', 'malformed hex field');
  }
  return hexToBytes(s.slice(2));
}

function u64(v: bigint): Uint8Array {
  requireArg(typeof v === 'bigint' && v >= 0n && v <= U64_MAX, 'u64 out of range');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v);
  return out;
}

function encodeRecord(a: PackableAnnouncement): Uint8Array {
  requireArg(Number.isInteger(a.logIndex) && a.logIndex >= 0 && a.logIndex <= 0xffff_ffff, 'logIndex out of range');
  if (typeof a.metadata !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(a.metadata)) {
    throw new PirError('INVALID_ARGUMENT', 'malformed hex field');
  }
  const meta = hexToBytes(a.metadata.slice(2));
  requireArg(meta.length <= 0xffff - FIXED - 2, 'metadata too long');
  const li = new Uint8Array(4);
  new DataView(li.buffer).setUint32(0, a.logIndex);
  const ml = new Uint8Array(2);
  new DataView(ml.buffer).setUint16(0, meta.length);
  return concatBytes(
    u64(a.schemeId),
    u64(a.blockNumber),
    li,
    fixedHex(a.blockHash, 32),
    fixedHex(a.stealthAddress, 20),
    fixedHex(a.caller, 20),
    fixedHex(a.ephemeralPublicKey, 33),
    ml,
    meta,
  );
}

/** Decoded record: same fields as {@link PackableAnnouncement}, lowercase hex. */
export type UnpackedAnnouncement = PackableAnnouncement;

function decodeRecord(rec: Uint8Array): UnpackedAnnouncement {
  if (rec.length < RECORD_HEADER) throw new PirError('BAD_PAGE', 'record too short');
  const dv = new DataView(rec.buffer, rec.byteOffset, rec.length);
  let o = 0;
  const schemeId = dv.getBigUint64(o);
  o += 8;
  const blockNumber = dv.getBigUint64(o);
  o += 8;
  const logIndex = dv.getUint32(o);
  o += 4;
  const hx = (len: number): string => {
    const s = `0x${bytesToHex(rec.subarray(o, o + len))}`;
    o += len;
    return s;
  };
  const blockHash = hx(32);
  const stealthAddress = hx(20);
  const caller = hx(20);
  const ephemeralPublicKey = hx(33);
  const mlen = dv.getUint16(o);
  o += 2;
  if (rec.length !== o + mlen) throw new PirError('BAD_PAGE', 'record length mismatch');
  const metadata = hx(mlen);
  return { schemeId, blockNumber, logIndex, blockHash, stealthAddress, caller, ephemeralPublicKey, metadata };
}

/**
 * Packs announcements into fixed-size pages. Layout of a page: `u16 count`, then per record `u16 len ||
 * record`, then zero padding to `pageBytes`. Records never span pages. Order is deterministic:
 * `(blockNumber, logIndex)` ascending, so every honest server builds byte-identical pages.
 *
 * @security Pages carry PUBLIC chain data only (no keys, tags or addresses of the user). An empty shard
 * yields one all-zero page so the database is never empty (`n >= 1`).
 * @throws PirError `TESTNET_ONLY`, `INVALID_ARGUMENT` (bad shard, duplicate id, record outside shard or larger than a page).
 */
export function packPages(
  anns: readonly PackableAnnouncement[],
  shard: Shard,
  pageBytes: number = DEFAULT_PAGE_BYTES,
): { pages: Uint8Array[]; manifest: Manifest } {
  assertTestnetChainId(shard.chainId);
  requireArg(Number.isInteger(pageBytes) && pageBytes >= MIN_PAGE_BYTES && pageBytes <= MAX_PAGE_BYTES, 'pageBytes out of range');
  requireArg(shard.fromBlock >= 0n && shard.fromBlock <= shard.toBlock && shard.toBlock <= U64_MAX, 'bad shard range');
  const sorted = [...anns].sort((x, y) =>
    x.blockNumber < y.blockNumber ? -1 : x.blockNumber > y.blockNumber ? 1 : x.logIndex - y.logIndex,
  );
  const encoded: { rec: Uint8Array; block: bigint }[] = [];
  let prev: PackableAnnouncement | undefined;
  for (const a of sorted) {
    requireArg(a.blockNumber >= shard.fromBlock && a.blockNumber <= shard.toBlock, 'announcement outside shard');
    requireArg(!(prev && prev.blockNumber === a.blockNumber && prev.logIndex === a.logIndex), 'duplicate announcement');
    prev = a;
    const rec = encodeRecord(a);
    requireArg(PAGE_HEADER + LEN_PREFIX + rec.length <= pageBytes, 'record larger than a page');
    encoded.push({ rec, block: a.blockNumber });
  }
  const pages: Uint8Array[] = [];
  const ranges: ([bigint, bigint] | null)[] = [];
  let cur: Uint8Array[] = [];
  let used = PAGE_HEADER;
  let lo = 0n;
  let hi = 0n;
  const flush = (): void => {
    const page = new Uint8Array(pageBytes);
    new DataView(page.buffer).setUint16(0, cur.length);
    let o = PAGE_HEADER;
    for (const r of cur) {
      new DataView(page.buffer).setUint16(o, r.length);
      page.set(r, o + LEN_PREFIX);
      o += LEN_PREFIX + r.length;
    }
    pages.push(page);
    ranges.push(cur.length === 0 ? null : [lo, hi]);
    cur = [];
    used = PAGE_HEADER;
  };
  for (const e of encoded) {
    const need = LEN_PREFIX + e.rec.length;
    if (used + need > pageBytes || cur.length === 0xffff) flush();
    if (cur.length === 0) lo = e.block;
    hi = e.block;
    cur.push(e.rec);
    used += need;
  }
  if (cur.length > 0 || pages.length === 0) flush();
  return { pages, manifest: buildManifest(pages, shard, ranges) };
}

/**
 * Decodes one page back into records.
 *
 * @security Strict: wrong size, overrun, trailing non-zero padding or a malformed record throws `BAD_PAGE`.
 * Output is untrusted until the page itself passed {@link verifyPage} and each record is re-validated by the caller.
 */
export function unpackPage(page: Uint8Array, pageBytes: number = page.length): UnpackedAnnouncement[] {
  if (page.length !== pageBytes || page.length < MIN_PAGE_BYTES) throw new PirError('BAD_PAGE', 'wrong page size');
  const dv = new DataView(page.buffer, page.byteOffset, page.length);
  const count = dv.getUint16(0);
  let o = PAGE_HEADER;
  const out: UnpackedAnnouncement[] = [];
  for (let i = 0; i < count; i++) {
    if (o + LEN_PREFIX > page.length) throw new PirError('BAD_PAGE', 'page overrun');
    const len = dv.getUint16(o);
    o += LEN_PREFIX;
    if (o + len > page.length) throw new PirError('BAD_PAGE', 'page overrun');
    out.push(decodeRecord(page.subarray(o, o + len)));
    o += len;
  }
  for (let i = o; i < page.length; i++) {
    if (page[i] !== 0) throw new PirError('BAD_PAGE', 'non-zero padding');
  }
  return out;
}
