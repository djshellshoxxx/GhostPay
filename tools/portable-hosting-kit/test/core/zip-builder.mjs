// @ts-check
// Adversarial ZIP builder for reader tests: every header field can be overridden independently in the local and
// central records, and arbitrary bytes can be placed before, between and after the records.
import zlib from 'node:zlib';
import { crc32 } from '../../src/core/zip.mjs';

/**
 * @typedef {object} HeaderFields
 * @property {number} [versionNeeded]
 * @property {number} [flags]
 * @property {number} [method]
 * @property {number} [time]
 * @property {number} [date]
 * @property {number} [crc]
 * @property {number} [csize]
 * @property {number} [usize]
 * @property {Buffer} [name]
 * @property {Buffer} [extra]
 */

/**
 * @typedef {object} RawEntry
 * @property {string | Buffer} name
 * @property {Buffer | string} [data]        uncompressed content (default empty)
 * @property {0 | 8 | number} [method]      default 0 (store)
 * @property {Buffer} [payload]              compressed bytes override
 * @property {HeaderFields} [central]        central-only overrides
 * @property {HeaderFields} [local]          local-only overrides
 * @property {HeaderFields} [both]           overrides for both records
 * @property {number} [madeBy]               default 0x0314 (Unix, 2.0)
 * @property {number} [externalAttr]         default regular file 0644
 * @property {Buffer} [comment]
 * @property {number} [diskStart]
 * @property {number} [offset]               central-directory local-header offset override
 * @property {boolean} [noLocal]             omit the local record (use with `offset`)
 */

/**
 * @typedef {object} ArchiveOptions
 * @property {Buffer} [prefix]   bytes before the first local header
 * @property {Buffer} [between]  bytes between the last local record and the central directory
 * @property {Buffer} [trailer]  bytes after the end-of-central-directory record
 * @property {{ disk?: number, cdDisk?: number, onDisk?: number, count?: number, cdSize?: number, cdOffset?: number, comment?: Buffer }} [eocd]
 * @property {Buffer} [beforeEocd] bytes between the central directory and EOCD (e.g. a ZIP64 locator)
 */

/**
 * @param {RawEntry} e
 * @returns {Required<Omit<HeaderFields, 'extra'>> & { extra: Buffer, payload: Buffer }}
 */
function baseFields(e) {
  const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
  const method = e.method ?? 0;
  const payload = e.payload ?? (method === 8 ? zlib.deflateRawSync(data) : data);
  const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, 'utf8');
  return { versionNeeded: 20, flags: 0x0800, method, time: 0, date: 0x21, crc: crc32(data), csize: payload.length, usize: data.length, name, extra: Buffer.alloc(0), payload };
}

/**
 * Local file record (header + name + extra + payload).
 * @param {RawEntry} e
 * @returns {Buffer}
 */
export function localRecord(e) {
  const f = { ...baseFields(e), ...e.both, ...e.local };
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(f.versionNeeded, 4);
  b.writeUInt16LE(f.flags, 6);
  b.writeUInt16LE(f.method, 8);
  b.writeUInt16LE(f.time, 10);
  b.writeUInt16LE(f.date, 12);
  b.writeUInt32LE(f.crc >>> 0, 14);
  b.writeUInt32LE(f.csize >>> 0, 18);
  b.writeUInt32LE(f.usize >>> 0, 22);
  b.writeUInt16LE(f.name.length, 26);
  b.writeUInt16LE(f.extra.length, 28);
  return Buffer.concat([b, f.name, f.extra, f.payload]);
}

/**
 * @param {RawEntry} e
 * @param {number} offset
 * @returns {Buffer}
 */
function centralRecord(e, offset) {
  const f = { ...baseFields(e), ...e.both, ...e.central };
  const comment = e.comment ?? Buffer.alloc(0);
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(e.madeBy ?? 0x0314, 4);
  b.writeUInt16LE(f.versionNeeded, 6);
  b.writeUInt16LE(f.flags, 8);
  b.writeUInt16LE(f.method, 10);
  b.writeUInt16LE(f.time, 12);
  b.writeUInt16LE(f.date, 14);
  b.writeUInt32LE(f.crc >>> 0, 16);
  b.writeUInt32LE(f.csize >>> 0, 20);
  b.writeUInt32LE(f.usize >>> 0, 24);
  b.writeUInt16LE(f.name.length, 28);
  b.writeUInt16LE(f.extra.length, 30);
  b.writeUInt16LE(comment.length, 32);
  b.writeUInt16LE(e.diskStart ?? 0, 34);
  b.writeUInt16LE(0, 36);
  b.writeUInt32LE((e.externalAttr ?? (0o100644 << 16)) >>> 0, 38);
  b.writeUInt32LE((e.offset ?? offset) >>> 0, 42);
  return Buffer.concat([b, f.name, f.extra, comment]);
}

/**
 * @param {RawEntry[]} entries
 * @param {ArchiveOptions} [opts]
 * @returns {Buffer}
 */
export function buildZip(entries, opts = {}) {
  const parts = [opts.prefix ?? Buffer.alloc(0)];
  let pos = parts[0]?.length ?? 0;
  /** @type {Buffer[]} */
  const centrals = [];
  for (const e of entries) {
    const offset = pos;
    if (!e.noLocal) {
      const rec = localRecord(e);
      parts.push(rec);
      pos += rec.length;
    }
    centrals.push(centralRecord(e, offset));
  }
  if (opts.between) {
    parts.push(opts.between);
    pos += opts.between.length;
  }
  const cd = Buffer.concat(centrals);
  const cdOffset = pos;
  parts.push(cd);
  if (opts.beforeEocd) parts.push(opts.beforeEocd);
  const o = opts.eocd ?? {};
  const comment = o.comment ?? Buffer.alloc(0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(o.disk ?? 0, 4);
  eocd.writeUInt16LE(o.cdDisk ?? 0, 6);
  eocd.writeUInt16LE(o.onDisk ?? entries.length, 8);
  eocd.writeUInt16LE(o.count ?? entries.length, 10);
  eocd.writeUInt32LE((o.cdSize ?? cd.length) >>> 0, 12);
  eocd.writeUInt32LE((o.cdOffset ?? cdOffset) >>> 0, 16);
  eocd.writeUInt16LE(comment.length, 20);
  parts.push(eocd, comment, opts.trailer ?? Buffer.alloc(0));
  return Buffer.concat(parts);
}
