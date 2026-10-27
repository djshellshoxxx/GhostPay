// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createZip, crc32, readZip } from '../../src/core/zip.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { SMALL_LIMITS, throwsCode, tmpDir } from './helpers.mjs';
import { buildZip, localRecord } from './zip-builder.mjs';

const LIMITS = DEFAULT_LIMITS;

/** @returns {{ name: string, data: Uint8Array }[]} */
function sampleEntries() {
  return [
    { name: 'top/site/index.html', data: Buffer.from('<p>hi</p>'.repeat(50)) },
    { name: 'top/site/caf\u00e9.json', data: Buffer.from('{"a":1}') },
    { name: 'top/site/empty.txt', data: new Uint8Array(0) },
    { name: 'top/site/random.bin', data: Uint8Array.from({ length: 256 }, (_, i) => (i * 167 + 13) & 0xff) },
    { name: 'top/HOSTING-MANIFEST.json', data: Buffer.from('{}\n') },
  ];
}

test('crc32 matches known vectors and zlib', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  const buf = Buffer.from('The quick brown fox jumps over the lazy dog');
  assert.equal(crc32(buf), zlib.crc32 ? zlib.crc32(buf) : 0x414fa339);
});

test('createZip is deterministic, sorted, and round-trips through readZip', () => {
  const entries = sampleEntries();
  const a = createZip(entries, { compression: 'deflate' });
  const b = createZip([...entries].reverse(), { compression: 'deflate' });
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  const back = readZip(a, { limits: LIMITS }).entries;
  assert.deepEqual(back.map((e) => e.name), ['top/HOSTING-MANIFEST.json', 'top/site/caf\u00e9.json', 'top/site/empty.txt', 'top/site/index.html', 'top/site/random.bin']);
  for (const e of entries) assert.deepEqual(Buffer.from(/** @type {any} */ (back.find((x) => x.name === e.name)).data), Buffer.from(e.data));
});

test('header fields: fixed DOS time, Unix mode 0644, UTF-8 flag, store when deflate is not smaller', () => {
  const zip = Buffer.from(createZip(sampleEntries(), { compression: 'deflate' }));
  const eocd = zip.length - 22;
  let p = zip.readUInt32LE(eocd + 16);
  /** @type {Record<string, number>} */
  const methods = {};
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    assert.equal(zip.readUInt32LE(p), 0x02014b50);
    assert.equal(zip.readUInt16LE(p + 4), 0x0314);
    assert.equal(zip.readUInt16LE(p + 8), 0x0800);
    assert.equal(zip.readUInt16LE(p + 12), 0);
    assert.equal(zip.readUInt16LE(p + 14), 0x21);
    assert.equal(zip.readUInt32LE(p + 38) >>> 16, 0o100644);
    const nameLen = zip.readUInt16LE(p + 28);
    methods[zip.subarray(p + 46, p + 46 + nameLen).toString('utf8')] = zip.readUInt16LE(p + 10);
    p += 46 + nameLen;
  }
  assert.equal(methods['top/site/index.html'], 8);
  assert.equal(methods['top/site/random.bin'], 0);
  assert.equal(methods['top/site/empty.txt'], 0);
  const stored = Buffer.from(createZip(sampleEntries(), { compression: 'store' }));
  assert.ok(stored.length > zip.length);
});

test('createZip refuses unsafe or colliding names', () => {
  throwsCode(() => createZip([{ name: '../x', data: new Uint8Array(0) }], { compression: 'store' }), 'E_PATH');
  throwsCode(() => createZip([{ name: 'a/B', data: new Uint8Array(0) }, { name: 'a/b', data: new Uint8Array(0) }], { compression: 'store' }), 'E_ARCHIVE');
});

const PY_READ = `
import hashlib, json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
out = {}
for i in z.infolist():
    out[i.filename] = {"sha256": hashlib.sha256(z.read(i)).hexdigest(), "mode": i.external_attr >> 16, "date_time": list(i.date_time), "method": i.compress_type}
z.extractall(sys.argv[2])
print(json.dumps(out))
`;

for (const compression of /** @type {const} */ (['deflate', 'store'])) {
  test(`python zipfile reads our ${compression} archive identically`, async (t) => {
    const dir = await tmpDir(t);
    const entries = sampleEntries();
    const file = path.join(dir, 'a.zip');
    await fsp.writeFile(file, createZip(entries, { compression }));
    const out = JSON.parse(execFileSync('python3', ['-c', PY_READ, file, path.join(dir, 'x')], { encoding: 'utf8' }));
    assert.deepEqual(Object.keys(out).sort(), entries.map((e) => e.name).sort());
    for (const e of entries) {
      const info = out[e.name];
      assert.equal(info.sha256, (await import('node:crypto')).createHash('sha256').update(e.data).digest('hex'));
      assert.equal(info.mode, 0o100644);
      assert.deepEqual(info.date_time, [1980, 1, 1, 0, 0, 0]);
      assert.deepEqual(await fsp.readFile(path.join(dir, 'x', ...e.name.split('/'))), Buffer.from(e.data));
    }
  });
}

test('readZip accepts an archive written by python zipfile (store and deflate, directory entry)', async (t) => {
  const dir = await tmpDir(t);
  const file = path.join(dir, 'py.zip');
  execFileSync('python3', ['-c', `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr(zipfile.ZipInfo("top/"), b"")
    z.writestr("top/site/index.html", b"<p>x</p>" * 100, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("top/site/caf\\u00e9.txt", b"stored", compress_type=zipfile.ZIP_STORED)
`, file]);
  const entries = readZip(await fsp.readFile(file), { limits: LIMITS }).entries;
  assert.deepEqual(entries.map((e) => [e.name, Buffer.from(e.data).toString()]), [
    ['top/site/index.html', '<p>x</p>'.repeat(100)],
    ['top/site/caf\u00e9.txt', 'stored'],
  ]);
});

test('the adversarial builder produces acceptable archives by default (baseline)', () => {
  const zip = buildZip([{ name: 'top/a.txt', data: 'hello' }, { name: 'top/b.txt', data: 'x'.repeat(100), method: 8 }]);
  assert.deepEqual(readZip(zip, { limits: LIMITS }).entries.map((e) => Buffer.from(e.data).toString()), ['hello', 'x'.repeat(100)]);
});

/** @typedef {{ title: string, zip: () => Buffer, code: string, message: RegExp, limits?: import('../../src/types.mjs').Limits }} BadCase */

/** @type {BadCase[]} */
const BAD = [
  { title: 'parent traversal', zip: () => buildZip([{ name: 'top/../evil.txt', data: 'x' }]), code: 'E_PATH', message: /unsafe entry name/ },
  { title: 'leading traversal', zip: () => buildZip([{ name: '../evil.txt', data: 'x' }]), code: 'E_PATH', message: /"\.\." segment/ },
  { title: 'absolute name', zip: () => buildZip([{ name: '/etc/passwd', data: 'x' }]), code: 'E_PATH', message: /absolute/ },
  { title: 'drive letter', zip: () => buildZip([{ name: 'C:/x.txt', data: 'x' }]), code: 'E_PATH', message: /drive/ },
  { title: 'backslash name', zip: () => buildZip([{ name: 'top\\..\\evil.txt', data: 'x' }]), code: 'E_PATH', message: /backslash/ },
  { title: 'NFD name', zip: () => buildZip([{ name: 'top/cafe\u0301.txt', data: 'x' }]), code: 'E_PATH', message: /NFC/ },
  { title: 'duplicate names', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }, { name: 'top/a.txt', data: 'y' }]), code: 'E_ARCHIVE', message: /duplicate/ },
  { title: 'case collision', zip: () => buildZip([{ name: 'top/A.txt', data: 'x' }, { name: 'top/a.txt', data: 'y' }]), code: 'E_ARCHIVE', message: /collides/ },
  { title: 'file used as directory', zip: () => buildZip([{ name: 'top/a', data: 'x' }, { name: 'top/a/b.txt', data: 'y' }]), code: 'E_ARCHIVE', message: /under a path that is a file/ },
  { title: 'symlink entry', zip: () => buildZip([{ name: 'top/link', data: '/etc/passwd', externalAttr: (0o120777 << 16) >>> 0 }]), code: 'E_ARCHIVE', message: /symlink/ },
  { title: 'device entry', zip: () => buildZip([{ name: 'top/dev', data: '', externalAttr: (0o020644 << 16) >>> 0 }]), code: 'E_ARCHIVE', message: /special-file/ },
  { title: 'encrypted entry', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { flags: 0x0801 } }]), code: 'E_ARCHIVE', message: /encrypted/ },
  { title: 'data descriptor', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { flags: 0x0808 } }]), code: 'E_ARCHIVE', message: /data descriptor/ },
  { title: 'unknown flag', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { flags: 0x0810 } }]), code: 'E_ARCHIVE', message: /unsupported flags/ },
  { title: 'non-ASCII name without UTF-8 flag', zip: () => buildZip([{ name: 'top/caf\u00e9.txt', data: 'x', both: { flags: 0 } }]), code: 'E_ARCHIVE', message: /UTF-8 flag/ },
  { title: 'invalid UTF-8 name', zip: () => buildZip([{ name: Buffer.from([0x74, 0x2f, 0xff]), data: 'x' }]), code: 'E_ARCHIVE', message: /not valid UTF-8/ },
  { title: 'ZIP64 marker in EOCD', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { eocd: { count: 0xffff, onDisk: 0xffff } }), code: 'E_ARCHIVE', message: /ZIP64/ },
  {
    title: 'ZIP64 locator before EOCD', code: 'E_ARCHIVE', message: /ZIP64/,
    zip: () => { const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); return buildZip([{ name: 'top/a.txt', data: 'x' }], { beforeEocd: loc }); },
  },
  { title: 'ZIP64 sizes', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { csize: 0xffffffff, usize: 0xffffffff } }]), code: 'E_ARCHIVE', message: /ZIP64/ },
  { title: 'ZIP64 version needed', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { versionNeeded: 45 } }]), code: 'E_ARCHIVE', message: /version/ },
  { title: 'extra field (zip64 / alternate name)', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { extra: Buffer.from([0x75, 0x70, 0x01, 0x00, 0x00]) } }]), code: 'E_ARCHIVE', message: /extra fields/ },
  { title: 'multi-disk EOCD', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { eocd: { disk: 1 } }), code: 'E_ARCHIVE', message: /multi-disk/ },
  { title: 'multi-disk entry', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', diskStart: 2 }]), code: 'E_ARCHIVE', message: /multi-disk/ },
  { title: 'unknown method', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', method: 12 }]), code: 'E_ARCHIVE', message: /method 12/ },
  { title: 'local/central CRC mismatch', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', local: { crc: 1 } }]), code: 'E_ARCHIVE', message: /does not match its central/ },
  { title: 'local/central name mismatch', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', local: { name: Buffer.from('top/b.txt') } }]), code: 'E_ARCHIVE', message: /name of "top\/a.txt" does not match/ },
  { title: 'local/central method mismatch', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', local: { method: 8 } }]), code: 'E_ARCHIVE', message: /does not match/ },
  { title: 'local extra field', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', local: { extra: Buffer.from([1, 0, 0, 0]) } }]), code: 'E_ARCHIVE', message: /does not match/ },
  {
    title: 'overlapping entries (second local header hidden inside the first entry data)', code: 'E_ARCHIVE', message: /overlaps/,
    zip: () => {
      const inner = { name: 'top/b.txt', data: 'inner' };
      const outerName = 'top/a.txt';
      return buildZip([{ name: outerName, data: localRecord(inner) }, { ...inner, noLocal: true, offset: 30 + outerName.length }]);
    },
  },
  {
    title: 'two central entries sharing one local record', code: 'E_ARCHIVE', message: /overlaps|does not match/,
    zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }, { name: 'top/a.txt', data: 'x', noLocal: true, offset: 0, central: { name: Buffer.from('top/c.txt') } }]),
  },
  { title: 'hidden local record in a gap', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { between: localRecord({ name: 'top/hidden.js', data: 'evil()' }) }), code: 'E_ARCHIVE', message: /unreferenced/ },
  { title: 'prepended data', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { prefix: Buffer.from('MZ-stub') }), code: 'E_ARCHIVE', message: /unreferenced/ },
  { title: 'trailing data', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { trailer: Buffer.from('junk') }), code: 'E_ARCHIVE', message: /last 22 bytes/ },
  { title: 'archive comment', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { eocd: { comment: Buffer.from('hi') } }), code: 'E_ARCHIVE', message: /last 22 bytes/ },
  { title: 'entry comment', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', comment: Buffer.from('c') }]), code: 'E_ARCHIVE', message: /comment/ },
  { title: 'CRC mismatch', zip: () => buildZip([{ name: 'top/a.txt', data: 'x', both: { crc: 12345 } }]), code: 'E_ARCHIVE', message: /CRC/ },
  { title: 'stored size mismatch', zip: () => buildZip([{ name: 'top/a.txt', data: 'abc', both: { usize: 4 } }]), code: 'E_ARCHIVE', message: /compressed size/ },
  { title: 'deflated output shorter than declared', zip: () => buildZip([{ name: 'top/a.txt', data: 'abcabcabc', method: 8, both: { usize: 20 } }]), code: 'E_ARCHIVE', message: /declared 20/ },
  {
    title: 'inflation beyond declared size (zip bomb)', code: 'E_ARCHIVE', message: /beyond its declared size/,
    zip: () => buildZip([{ name: 'top/bomb.txt', data: Buffer.alloc(4 * 1024 * 1024), method: 8, both: { usize: 1000 } }]),
  },
  {
    title: 'bytes hidden after the end of the deflate stream', code: 'E_ARCHIVE', message: /after the end of its deflate stream/,
    zip: () => buildZip([{ name: 'top/a.txt', data: 'abcabc', method: 8, payload: Buffer.concat([zlib.deflateRawSync(Buffer.from('abcabc')), Buffer.from('hidden')]) }]),
  },
  { title: 'truncated deflate data', zip: () => buildZip([{ name: 'top/a.txt', data: 'abc', method: 8, payload: Buffer.from([0x4b]) }]), code: 'E_ARCHIVE', message: /corrupt deflate/ },
  {
    title: 'declared size beyond maxFileBytes (checked before inflating)', code: 'E_LIMIT', message: /maxFileBytes/, limits: SMALL_LIMITS,
    zip: () => buildZip([{ name: 'top/big.txt', data: Buffer.alloc(SMALL_LIMITS.maxFileBytes + 1), method: 8 }]),
  },
  {
    title: 'declared total beyond maxTotalBytes', code: 'E_LIMIT', message: /maxTotalBytes/, limits: SMALL_LIMITS,
    zip: () => buildZip(Array.from({ length: 5 }, (_, i) => ({ name: `top/f${i}.txt`, data: Buffer.alloc(15000), method: /** @type {8} */ (8) }))),
  },
  { title: 'too many files', limits: SMALL_LIMITS, code: 'E_LIMIT', message: /files/, zip: () => buildZip(Array.from({ length: 51 }, (_, i) => ({ name: `top/f${i}.txt`, data: '' }))) },
  { title: 'too many entries', limits: { ...SMALL_LIMITS, maxDirEntries: 10 }, code: 'E_LIMIT', message: /maxDirEntries/, zip: () => buildZip(Array.from({ length: 11 }, (_, i) => ({ name: `top/f${i}.txt`, data: '' }))) },
  { title: 'more than one top-level directory', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }, { name: 'other/b.txt', data: 'y' }]), code: 'E_ARCHIVE', message: /more than one top-level/ },
  { title: 'file at the top level', zip: () => buildZip([{ name: 'a.txt', data: 'x' }]), code: 'E_ARCHIVE', message: /not inside the top-level/ },
  { title: 'directory entry with data', zip: () => buildZip([{ name: 'top/d/', data: 'x', externalAttr: (0o040755 << 16) >>> 0 }]), code: 'E_ARCHIVE', message: /has data/ },
  { title: 'directory name with regular-file mode bits', zip: () => buildZip([{ name: 'top/d/', data: '' }]), code: 'E_ARCHIVE', message: /type bits disagree/ },
  { title: 'empty archive', zip: () => buildZip([]), code: 'E_ARCHIVE', message: /no entries/ },
  { title: 'not a zip', zip: () => Buffer.from('hello world, definitely not a zip file'), code: 'E_ARCHIVE', message: /last 22 bytes/ },
  { title: 'truncated archive', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }]).subarray(0, 10), code: 'E_ARCHIVE', message: /too short/ },
  { title: 'central directory offset out of range', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { eocd: { cdOffset: 3 } }), code: 'E_ARCHIVE', message: /central directory does not end/ },
  { title: 'entry count larger than central directory', zip: () => buildZip([{ name: 'top/a.txt', data: 'x' }], { eocd: { count: 2, onDisk: 2 } }), code: 'E_ARCHIVE', message: /truncated|bad signature/ },
];

for (const c of BAD) {
  test(`readZip rejects: ${c.title}`, () => {
    throwsCode(() => readZip(c.zip(), { limits: c.limits ?? LIMITS }), c.code, c.message);
  });
}

test('singleTopDir can be disabled for generic use', () => {
  const zip = buildZip([{ name: 'a/x.txt', data: 'x' }, { name: 'b.txt', data: 'y' }]);
  assert.equal(readZip(zip, { limits: LIMITS, singleTopDir: false }).entries.length, 2);
});
