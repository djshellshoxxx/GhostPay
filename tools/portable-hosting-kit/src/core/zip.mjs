// @ts-check
// Deterministic ZIP writer and a strict, bounded ZIP reader for hosting-kit archives.
// Supported subset (both directions): no ZIP64, no encryption, no data descriptors, no extra fields, no comments,
// single disk, methods store (0) and deflate (8), UTF-8 names.
import zlib from 'node:zlib';
import { ERROR_CODES, KitError, isKitError } from '../errors.mjs';
import { collisionKey, compareUtf8, validateRelativePath } from './paths.mjs';

/** @typedef {import('../types.mjs').Limits} Limits */
/** @typedef {{ name: string, data: Uint8Array }} ZipEntry */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const LOCAL_LEN = 30;
const CENTRAL_LEN = 46;
const EOCD_LEN = 22;
const VERSION = 20; // 2.0: deflate, directories
const MADE_BY_UNIX = (3 << 8) | VERSION;
const FLAG_UTF8 = 0x0800;
const FLAGS_ALLOWED = 0x0806; // bit 11 UTF-8, bits 1-2 deflate option hints
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_MASKED_HEADERS = 0x2000;
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const MODE_FILE = 0o100644;
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
// Permissive structural bounds used when the writer checks its own entry names.
const WRITER_PATH_LIMITS = { maxPathBytes: MAX_U16, maxSegmentBytes: 255, maxDepth: 1024 };

let crcTable = /** @type {Uint32Array | null} */ (null);

/**
 * CRC-32 (IEEE 802.3), table driven. Kept local so the kit does not depend on zlib.crc32 (Node >= 22.2).
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  const t = crcTable;
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = /** @type {number} */ (t[(c ^ /** @type {number} */ (bytes[i])) & 0xff]) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Writer

/**
 * Build a ZIP archive deterministically: entries sorted by UTF-8 name, fixed DOS timestamp, mode 0644, Unix
 * version-made-by, deflate level 9 unless storing is not larger (or `compression: 'store'`).
 * @param {ZipEntry[]} entries
 * @param {{ compression: 'deflate' | 'store' }} opts
 * @returns {Uint8Array}
 */
export function createZip(entries, opts) {
  if (opts.compression !== 'deflate' && opts.compression !== 'store') throw new KitError(ERROR_CODES.USAGE, `unknown compression ${String(opts.compression)}`);
  const sorted = [...entries].sort((a, b) => compareUtf8(a.name, b.name));
  checkWriterNames(sorted);
  if (sorted.length >= MAX_U16) throw new KitError(ERROR_CODES.LIMIT, 'too many entries for a ZIP without ZIP64');
  /** @type {Buffer[]} */
  const locals = [];
  /** @type {Buffer[]} */
  const centrals = [];
  let offset = 0;
  for (const e of sorted) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const { method, payload } = compress(data, opts.compression);
    const crc = crc32(data);
    if (data.length >= MAX_U32 || payload.length >= MAX_U32) throw new KitError(ERROR_CODES.LIMIT, `entry too large for a ZIP without ZIP64: ${e.name}`);
    const fields = { method, crc, csize: payload.length, usize: data.length, name };
    const local = localHeader(fields);
    centrals.push(centralHeader(fields, offset));
    locals.push(local, payload);
    offset += local.length + payload.length;
    if (offset >= MAX_U32) throw new KitError(ERROR_CODES.LIMIT, 'archive too large for a ZIP without ZIP64');
  }
  const cd = Buffer.concat(centrals);
  if (offset + cd.length >= MAX_U32) throw new KitError(ERROR_CODES.LIMIT, 'archive too large for a ZIP without ZIP64');
  const eocd = Buffer.alloc(EOCD_LEN);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

/**
 * @param {ZipEntry[]} sorted
 */
function checkWriterNames(sorted) {
  const keys = new Set();
  for (const e of sorted) {
    const c = validateRelativePath(e.name, WRITER_PATH_LIMITS);
    if (!c.ok) throw new KitError(ERROR_CODES.PATH, `invalid entry name "${e.name}": ${c.reason}`);
    const k = collisionKey(e.name);
    if (keys.has(k)) throw new KitError(ERROR_CODES.ARCHIVE, `duplicate or colliding entry name "${e.name}"`);
    keys.add(k);
  }
}

/**
 * @param {Buffer} data
 * @param {'deflate' | 'store'} mode
 * @returns {{ method: 0 | 8, payload: Buffer }}
 */
function compress(data, mode) {
  if (mode === 'store') return { method: 0, payload: data };
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  return deflated.length < data.length ? { method: 8, payload: deflated } : { method: 0, payload: data };
}

/**
 * @param {{ method: number, crc: number, csize: number, usize: number, name: Buffer }} f
 * @returns {Buffer}
 */
function localHeader(f) {
  const b = Buffer.alloc(LOCAL_LEN + f.name.length);
  b.writeUInt32LE(SIG_LOCAL, 0);
  b.writeUInt16LE(VERSION, 4);
  b.writeUInt16LE(FLAG_UTF8, 6);
  b.writeUInt16LE(f.method, 8);
  b.writeUInt16LE(DOS_TIME, 10);
  b.writeUInt16LE(DOS_DATE, 12);
  b.writeUInt32LE(f.crc, 14);
  b.writeUInt32LE(f.csize, 18);
  b.writeUInt32LE(f.usize, 22);
  b.writeUInt16LE(f.name.length, 26);
  b.writeUInt16LE(0, 28);
  f.name.copy(b, LOCAL_LEN);
  return b;
}

/**
 * @param {{ method: number, crc: number, csize: number, usize: number, name: Buffer }} f
 * @param {number} offset
 * @returns {Buffer}
 */
function centralHeader(f, offset) {
  const b = Buffer.alloc(CENTRAL_LEN + f.name.length);
  b.writeUInt32LE(SIG_CENTRAL, 0);
  b.writeUInt16LE(MADE_BY_UNIX, 4);
  b.writeUInt16LE(VERSION, 6);
  b.writeUInt16LE(FLAG_UTF8, 8);
  b.writeUInt16LE(f.method, 10);
  b.writeUInt16LE(DOS_TIME, 12);
  b.writeUInt16LE(DOS_DATE, 14);
  b.writeUInt32LE(f.crc, 16);
  b.writeUInt32LE(f.csize, 20);
  b.writeUInt32LE(f.usize, 24);
  b.writeUInt16LE(f.name.length, 28);
  b.writeUInt16LE(0, 30); // extra
  b.writeUInt16LE(0, 32); // comment
  b.writeUInt16LE(0, 34); // disk start
  b.writeUInt16LE(0, 36); // internal attributes
  b.writeUInt32LE((MODE_FILE << 16) >>> 0, 38);
  b.writeUInt32LE(offset, 42);
  f.name.copy(b, CENTRAL_LEN);
  return b;
}

// ---------------------------------------------------------------------------------------------------------------
// Reader

/**
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {never}
 */
function malformed(message, details) {
  throw new KitError(ERROR_CODES.ARCHIVE, `archive: ${message}`, details);
}

/**
 * @param {string} message
 * @returns {never}
 */
function overLimit(message) {
  throw new KitError(ERROR_CODES.LIMIT, `archive: ${message}`);
}

/**
 * @typedef {object} CentralRecord
 * @property {string} name        name as stored (directories keep their trailing "/")
 * @property {Buffer} nameBytes
 * @property {boolean} isDir
 * @property {number} versionNeeded
 * @property {number} flags
 * @property {number} method
 * @property {number} time
 * @property {number} date
 * @property {number} crc
 * @property {number} csize
 * @property {number} usize
 * @property {number} offset      local header offset
 */

/**
 * Locate and check the end-of-central-directory record. It must be the last 22 bytes (no archive comment, no
 * trailing data), describe a single-disk, non-ZIP64 archive, and its central directory must end exactly at it.
 * @param {Buffer} buf
 * @param {Limits} limits
 * @returns {{ count: number, cdOffset: number, cdEnd: number }}
 */
function readEocd(buf, limits) {
  if (buf.length < EOCD_LEN) malformed('too short to be a ZIP file');
  const at = buf.length - EOCD_LEN;
  if (buf.readUInt32LE(at) !== SIG_EOCD) malformed('end-of-central-directory record is not the last 22 bytes (archive comment, trailing data or not a ZIP)');
  const disk = buf.readUInt16LE(at + 4);
  const cdDisk = buf.readUInt16LE(at + 6);
  const onDisk = buf.readUInt16LE(at + 8);
  const count = buf.readUInt16LE(at + 10);
  const cdSize = buf.readUInt32LE(at + 12);
  const cdOffset = buf.readUInt32LE(at + 16);
  if (count === MAX_U16 || onDisk === MAX_U16 || cdSize === MAX_U32 || cdOffset === MAX_U32) malformed('ZIP64 is not supported');
  if (at >= 20 && buf.readUInt32LE(at - 20) === SIG_ZIP64_LOCATOR) malformed('ZIP64 is not supported');
  if (disk !== 0 || cdDisk !== 0 || onDisk !== count) malformed('multi-disk archives are not supported');
  if (count === 0) malformed('archive has no entries');
  if (count > limits.maxDirEntries) overLimit(`${count} entries exceed maxDirEntries ${limits.maxDirEntries}`);
  if (cdOffset + cdSize !== at) malformed('central directory does not end at the end-of-central-directory record');
  return { count, cdOffset, cdEnd: at };
}

/**
 * Decode an entry name: valid UTF-8, and non-ASCII only with the UTF-8 flag (otherwise readers disagree: CP437).
 * @param {Buffer} bytes
 * @param {number} flags
 * @returns {string}
 */
function decodeName(bytes, flags) {
  const ascii = bytes.every((b) => b < 0x80);
  if (!ascii && !(flags & FLAG_UTF8)) malformed('non-ASCII entry name without the UTF-8 flag');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return malformed('entry name is not valid UTF-8');
  }
}

/**
 * Feature checks shared by central and local headers.
 * @param {string} name
 * @param {number} versionNeeded
 * @param {number} flags
 * @param {number} method
 * @param {number} csize
 * @param {number} usize
 */
function checkFeatures(name, versionNeeded, flags, method, csize, usize) {
  if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADERS)) malformed(`encrypted entry "${name}"`);
  if (flags & FLAG_DATA_DESCRIPTOR) malformed(`entry "${name}" uses a data descriptor`);
  if (flags & ~FLAGS_ALLOWED) malformed(`entry "${name}" has unsupported flags 0x${flags.toString(16)}`);
  if (csize === MAX_U32 || usize === MAX_U32) malformed(`entry "${name}" requires ZIP64`);
  if (versionNeeded > VERSION) malformed(`entry "${name}" needs ZIP version ${versionNeeded / 10} (ZIP64/encryption/other features unsupported)`);
  if (method !== 0 && method !== 8) malformed(`entry "${name}" uses unsupported compression method ${method}`);
  if (method === 0 && csize !== usize) malformed(`stored entry "${name}" has compressed size ${csize} != size ${usize}`);
}

/**
 * Reject symlinks and special files declared through Unix mode bits in the external attributes.
 * @param {string} name
 * @param {number} madeBy
 * @param {number} external
 * @param {boolean} isDir
 */
function checkFileType(name, madeBy, external, isDir) {
  const host = madeBy >>> 8;
  if (host !== 3 && host !== 19) return; // Unix, OS X: high 16 bits carry st_mode
  const type = (external >>> 16) & S_IFMT;
  if (type === 0) return;
  if (type === S_IFLNK) malformed(`symlink entry "${name}"`);
  if (type !== S_IFREG && type !== S_IFDIR) malformed(`special-file entry "${name}"`);
  if ((type === S_IFDIR) !== isDir) malformed(`entry "${name}" type bits disagree with its name`);
}

/**
 * Parse the central directory with bounds, feature and limit checks; no data is inflated here.
 * @param {Buffer} buf
 * @param {{ count: number, cdOffset: number, cdEnd: number }} eocd
 * @param {Limits} limits
 * @returns {CentralRecord[]}
 */
function readCentral(buf, eocd, limits) {
  /** @type {CentralRecord[]} */
  const out = [];
  let pos = eocd.cdOffset;
  let files = 0;
  let total = 0;
  for (let i = 0; i < eocd.count; i++) {
    if (pos + CENTRAL_LEN > eocd.cdEnd || buf.readUInt32LE(pos) !== SIG_CENTRAL) malformed(`central directory entry ${i} is truncated or has a bad signature`);
    const madeBy = buf.readUInt16LE(pos + 4);
    const versionNeeded = buf.readUInt16LE(pos + 6);
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const diskStart = buf.readUInt16LE(pos + 34);
    const end = pos + CENTRAL_LEN + nameLen + extraLen + commentLen;
    if (end > eocd.cdEnd) malformed(`central directory entry ${i} overruns the central directory`);
    const nameBytes = buf.subarray(pos + CENTRAL_LEN, pos + CENTRAL_LEN + nameLen);
    const name = decodeName(nameBytes, flags);
    const csize = buf.readUInt32LE(pos + 20);
    const usize = buf.readUInt32LE(pos + 24);
    const offset = buf.readUInt32LE(pos + 42);
    if (extraLen !== 0) malformed(`entry "${name}" has extra fields (unsupported; may carry ZIP64 or alternate names)`);
    if (commentLen !== 0) malformed(`entry "${name}" has a comment (unsupported)`);
    if (diskStart !== 0) malformed('multi-disk archives are not supported');
    if (offset === MAX_U32) malformed(`entry "${name}" requires ZIP64`);
    checkFeatures(name, versionNeeded, flags, method, csize, usize);
    const isDir = name.endsWith('/');
    checkFileType(name, madeBy, buf.readUInt32LE(pos + 38), isDir);
    if (isDir) {
      if (usize !== 0 || csize !== 0) malformed(`directory entry "${name}" has data`);
    } else {
      if (++files > limits.maxFiles) overLimit(`more than ${limits.maxFiles} files`);
      if (usize > limits.maxFileBytes) overLimit(`entry "${name}" declares ${usize} bytes, more than maxFileBytes ${limits.maxFileBytes}`);
      total += usize;
      if (total > limits.maxTotalBytes) overLimit(`declared sizes exceed maxTotalBytes ${limits.maxTotalBytes}`);
    }
    out.push({ name, nameBytes, isDir, versionNeeded, flags, method, time: buf.readUInt16LE(pos + 12), date: buf.readUInt16LE(pos + 14), crc: buf.readUInt32LE(pos + 16), csize, usize, offset });
    pos = end;
  }
  if (pos !== eocd.cdEnd) malformed('central directory has trailing bytes');
  return out;
}

/**
 * Names: valid portable paths, unique under case/Unicode folding, no file used as a directory, and (optionally) all
 * under one top-level directory.
 * @param {CentralRecord[]} records
 * @param {Limits} limits
 * @param {boolean} singleTopDir
 */
function checkNames(records, limits, singleTopDir) {
  const exact = new Set();
  /** @type {Map<string, boolean>} collision key -> isDir */
  const kinds = new Map();
  /** @type {string | null} */
  let top = null;
  for (const r of records) {
    const p = r.isDir ? r.name.slice(0, -1) : r.name;
    const c = validateRelativePath(p, limits);
    if (!c.ok) throw new KitError(ERROR_CODES.PATH, `archive: unsafe entry name ${JSON.stringify(r.name)}: ${c.reason}`, { rule: c.rule });
    if (exact.has(p)) malformed(`duplicate entry name "${r.name}"`);
    exact.add(p);
    const key = collisionKey(p);
    if (kinds.has(key)) malformed(`entry name "${r.name}" collides with another entry on case-insensitive or normalizing hosts`);
    kinds.set(key, r.isDir);
    const segs = p.split('/');
    if (singleTopDir) {
      if (!r.isDir && segs.length < 2) malformed(`file "${r.name}" is not inside the top-level directory`);
      if (top === null) top = segs[0] ?? null;
      else if (segs[0] !== top) malformed(`more than one top-level directory ("${top}", "${segs[0]}")`);
    }
  }
  for (const r of records) {
    const segs = collisionKey(r.isDir ? r.name.slice(0, -1) : r.name).split('/');
    for (let d = 1; d < segs.length; d++) {
      if (kinds.get(segs.slice(0, d).join('/')) === false) malformed(`entry "${r.name}" lies under a path that is a file`);
    }
  }
}

/**
 * Check each local header against its central record and require the entries to tile [0, cdOffset) exactly
 * (no overlaps, gaps or hidden data that a streaming reader might interpret differently).
 * @param {Buffer} buf
 * @param {CentralRecord[]} records
 * @param {number} cdOffset
 * @returns {Map<CentralRecord, Buffer>} compressed payload per record
 */
function readLocals(buf, records, cdOffset) {
  /** @type {Map<CentralRecord, Buffer>} */
  const payloads = new Map();
  const byOffset = [...records].sort((a, b) => a.offset - b.offset);
  let expected = 0;
  for (const r of byOffset) {
    if (r.offset < expected) malformed(`entry "${r.name}" overlaps the previous entry`);
    if (r.offset > expected) malformed(`unreferenced bytes before entry "${r.name}"`);
    const p = r.offset;
    if (p + LOCAL_LEN > cdOffset || buf.readUInt32LE(p) !== SIG_LOCAL) malformed(`local header of "${r.name}" is missing or truncated`);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const same = buf.readUInt16LE(p + 4) === r.versionNeeded && buf.readUInt16LE(p + 6) === r.flags && buf.readUInt16LE(p + 8) === r.method
      && buf.readUInt16LE(p + 10) === r.time && buf.readUInt16LE(p + 12) === r.date && buf.readUInt32LE(p + 14) === r.crc
      && buf.readUInt32LE(p + 18) === r.csize && buf.readUInt32LE(p + 22) === r.usize && nameLen === r.nameBytes.length && extraLen === 0;
    if (!same) malformed(`local header of "${r.name}" does not match its central directory entry`);
    const dataStart = p + LOCAL_LEN + nameLen;
    if (dataStart > cdOffset || !buf.subarray(p + LOCAL_LEN, dataStart).equals(r.nameBytes)) malformed(`local header name of "${r.name}" does not match its central directory entry`);
    const dataEnd = dataStart + r.csize;
    if (dataEnd > cdOffset) malformed(`data of "${r.name}" overruns into the central directory`);
    payloads.set(r, buf.subarray(dataStart, dataEnd));
    expected = dataEnd;
  }
  if (expected !== cdOffset) malformed('unreferenced bytes before the central directory');
  return payloads;
}

/**
 * Decompress with output bounded by the declared size, then check size and CRC.
 * @param {CentralRecord} r
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function extract(r, payload) {
  let data = payload;
  if (r.method === 8) {
    try {
      const out = /** @type {{ buffer: Buffer, engine: { bytesWritten: number } }} */ (/** @type {unknown} */ (zlib.inflateRawSync(payload, { maxOutputLength: Math.max(1, r.usize), info: true })));
      // Bytes after the end of the deflate stream would be hidden data that other readers may treat differently.
      if (out.engine.bytesWritten !== payload.length) malformed(`entry "${r.name}" has ${payload.length - out.engine.bytesWritten} bytes after the end of its deflate stream`);
      data = out.buffer;
    } catch (e) {
      if (isKitError(e)) throw e;
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      if (code === 'ERR_BUFFER_TOO_LARGE') malformed(`entry "${r.name}" inflates beyond its declared size ${r.usize}`);
      malformed(`entry "${r.name}" has corrupt deflate data: ${/** @type {Error} */ (e).message}`);
    }
  }
  if (data.length !== r.usize) malformed(`entry "${r.name}" has ${data.length} bytes, declared ${r.usize}`);
  if (crc32(data) !== r.crc) malformed(`entry "${r.name}" fails its CRC-32 check`);
  return data;
}

/**
 * Strict, bounded reader for untrusted archives. Returns file entries (directory entries are validated but not
 * returned) in archive order; `data` may be a view into `bytes`.
 * Throws KitError E_ARCHIVE (malformed/unsupported), E_LIMIT (bounds) or E_PATH (unsafe names).
 * @param {Uint8Array} bytes
 * @param {{ limits: Limits, singleTopDir?: boolean }} opts  singleTopDir defaults to true (kit archive layout)
 * @returns {{ entries: ZipEntry[] }}
 */
export function readZip(bytes, opts) {
  const { limits } = opts;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = readEocd(buf, limits);
  const records = readCentral(buf, eocd, limits);
  checkNames(records, limits, opts.singleTopDir ?? true);
  const payloads = readLocals(buf, records, eocd.cdOffset);
  /** @type {ZipEntry[]} */
  const entries = [];
  for (const r of records) {
    const data = extract(r, /** @type {Buffer} */ (payloads.get(r)));
    if (!r.isDir) entries.push({ name: r.name, data });
  }
  return { entries };
}
