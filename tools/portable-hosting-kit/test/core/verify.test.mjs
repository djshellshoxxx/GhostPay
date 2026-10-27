// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '../../src/core/hash.mjs';
import { packageSite } from '../../src/core/package.mjs';
import { validateSite } from '../../src/core/validate.mjs';
import { extractArchive, verifyArchive, verifyDirectory } from '../../src/core/verify.mjs';
import { createZip, readZip } from '../../src/core/zip.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { goodSite, rejectsCode, tmpDir, writeTree } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').Provenance} Provenance */

/** @type {Provenance} */
const PROVENANCE = { label: 'demo', sourceDateEpoch: null, source: { kind: 'directory' }, notes: [] };

/**
 * Package the good fixture; returns paths and the archive entries.
 * @param {import('node:test').TestContext} t
 */
async function packaged(t) {
  const site = await tmpDir(t, 'hk-core-site-');
  await writeTree(site, goodSite());
  const report = await validateSite(site);
  const out = await tmpDir(t);
  const res = await packageSite({
    report, outFile: path.join(out, 'site.zip'), appId: 'ghostpay-web', provenance: PROVENANCE, limits: DEFAULT_LIMITS, allowSourceMaps: false,
    extraFiles: [{ name: 'OPERATOR.md', data: Buffer.from('# ops\n') }],
  });
  const bytes = await fsp.readFile(res.archivePath);
  const entries = readZip(bytes, { limits: DEFAULT_LIMITS }).entries;
  return { ...res, out, site, bytes, entries };
}

let repackCounter = 0;

/**
 * Re-zip modified entries (an attacker re-packing the archive) and write it next to the original.
 * @param {Awaited<ReturnType<typeof packaged>>} p
 * @param {(entries: { name: string, data: Uint8Array }[]) => { name: string, data: Uint8Array }[]} edit
 */
async function repacked(p, edit) {
  const file = path.join(p.out, `tampered-${++repackCounter}.zip`);
  await fsp.writeFile(file, createZip(edit(p.entries.map((e) => ({ name: e.name, data: Buffer.from(e.data) }))), { compression: 'deflate' }));
  return file;
}

/**
 * @param {Awaited<ReturnType<typeof packaged>>} p
 * @param {string} rel
 */
const named = (p, rel) => `${p.topDir}/${rel}`;

test('a packaged archive verifies; authenticity is not established without an expected value', async (t) => {
  const p = await packaged(t);
  const r = await verifyArchive(p.archivePath);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.authenticity, 'not-established');
  assert.equal(r.archiveSha256, p.archiveSha256);
  assert.equal(r.contentDigest, p.manifest.content.digest);
  assert.deepEqual([r.changed, r.missing, r.unexpected, r.errors], [[], [], [], []]);
});

test('authenticity is established only by a matching expected digest or archive sha256', async (t) => {
  const p = await packaged(t);
  const digest = p.manifest.content.digest;
  assert.equal((await verifyArchive(p.archivePath, { expectedContentDigest: digest })).authenticity, 'content-digest-matches-expected');
  assert.equal((await verifyArchive(p.archivePath, { expectedContentDigest: digest.slice(7).toUpperCase() })).authenticity, 'content-digest-matches-expected');
  assert.equal((await verifyArchive(p.archivePath, { expectedArchiveSha256: p.archiveSha256 })).authenticity, 'archive-sha256-matches-expected');
  const wrongDigest = await verifyArchive(p.archivePath, { expectedContentDigest: `sha256:${'0'.repeat(64)}` });
  assert.equal(wrongDigest.ok, false);
  assert.equal(wrongDigest.authenticity, 'not-established');
  assert.deepEqual(wrongDigest.errors.map((e) => e.rule), ['content-digest-mismatch']);
  const wrongSha = await verifyArchive(p.archivePath, { expectedArchiveSha256: '1'.repeat(64) });
  assert.equal(wrongSha.ok, false);
  assert.deepEqual(wrongSha.errors.map((e) => e.rule), ['archive-sha256-mismatch']);
  await rejectsCode(verifyArchive(p.archivePath, { expectedArchiveSha256: 'xyz' }), 'E_USAGE');
});

test('archive tampering: changed, missing and unexpected files are reported separately', async (t) => {
  const p = await packaged(t);
  const file = await repacked(p, (es) => [
    ...es.filter((e) => e.name !== named(p, 'site/LICENSE')).map((e) => (e.name === named(p, 'site/assets/app.js') ? { ...e, data: Buffer.from('evil()') } : e)),
    { name: named(p, 'site/injected.js'), data: Buffer.from('x') },
  ]);
  const r = await verifyArchive(file);
  assert.equal(r.ok, false);
  assert.deepEqual(r.changed, ['site/assets/app.js']);
  assert.deepEqual(r.missing, ['site/LICENSE']);
  assert.deepEqual(r.unexpected, ['site/injected.js']);
  assert.equal(r.authenticity, 'not-established');
});

test('editing the manifest is caught by SHA256SUMS', async (t) => {
  const p = await packaged(t);
  const manifestName = named(p, 'HOSTING-MANIFEST.json');
  /** @param {Uint8Array} d */
  const relabel = (d) => Buffer.from(Buffer.from(d).toString('utf8').replace('"label": "demo"', '"label": "evil"'));
  const r = await verifyArchive(await repacked(p, (es) => es.map((e) => (e.name === manifestName ? { ...e, data: relabel(e.data) } : e))));
  assert.equal(r.ok, false);
  assert.deepEqual(r.changed, ['HOSTING-MANIFEST.json']);
  const broken = await verifyArchive(await repacked(p, (es) => es.map((e) => (e.name === manifestName ? { ...e, data: Buffer.from('{"schema":1}') } : e))));
  assert.deepEqual(broken.errors.map((e) => e.rule), ['manifest-invalid']);
  assert.deepEqual(broken.changed, ['HOSTING-MANIFEST.json']);
  const gone = await verifyArchive(await repacked(p, (es) => es.filter((e) => e.name !== manifestName)));
  assert.deepEqual(gone.missing, ['HOSTING-MANIFEST.json']);
  assert.ok(gone.errors.some((e) => e.rule === 'manifest-missing'));
});

test('a fully consistent forgery verifies structurally but fails against the expected digest', async (t) => {
  const p = await packaged(t);
  const { contentDigest, serializeManifest, parseManifest } = await import('../../src/core/manifest.mjs');
  const { formatSums } = await import('../../src/core/verify.mjs');
  const manifestName = named(p, 'HOSTING-MANIFEST.json');
  const evil = Buffer.from('evil()');
  const file = await repacked(p, (es) => {
    const m = parseManifest(/** @type {any} */ (es.find((e) => e.name === manifestName)).data);
    const files = m.content.files.map((f) => (f.path === 'assets/app.js' ? { ...f, sha256: sha256Hex(evil), size: evil.length } : f));
    const forgedManifest = { ...m, content: { ...m.content, files, totalBytes: files.reduce((s, f) => s + f.size, 0), digest: contentDigest(m.content.entrypoint, files) } };
    const withEvil = es.map((e) => (e.name === named(p, 'site/assets/app.js') ? { ...e, data: evil } : e.name === manifestName ? { ...e, data: Buffer.from(serializeManifest(forgedManifest)) } : e));
    const hashes = new Map(withEvil.filter((e) => !e.name.endsWith('/SHA256SUMS')).map((e) => [e.name.slice(p.topDir.length + 1), sha256Hex(e.data)]));
    return withEvil.map((e) => (e.name.endsWith('/SHA256SUMS') ? { ...e, data: formatSums(hashes) } : e));
  });
  const plain = await verifyArchive(file);
  assert.equal(plain.ok, true);
  assert.equal(plain.authenticity, 'not-established');
  const pinned = await verifyArchive(file, { expectedContentDigest: p.manifest.content.digest });
  assert.equal(pinned.ok, false);
  assert.deepEqual(pinned.errors.map((e) => e.rule), ['content-digest-mismatch']);
});

test('editing SHA256SUMS is detected (hash mismatch, malformed, self-listing, missing)', async (t) => {
  const p = await packaged(t);
  const sumsName = named(p, 'SHA256SUMS');
  /** @param {(s: string) => string} f */
  const editSums = (f) => repacked(p, (es) => es.map((e) => (e.name === sumsName ? { ...e, data: Buffer.from(f(Buffer.from(e.data).toString('utf8'))) } : e)));
  const flipped = await verifyArchive(await editSums((s) => s.replace(/^[0-9a-f]/, (c) => (c === '0' ? '1' : '0'))));
  assert.equal(flipped.ok, false);
  assert.ok(flipped.errors.some((e) => e.rule === 'sums-manifest-mismatch') || flipped.changed.length > 0);
  const malformed = await verifyArchive(await editSums((s) => s.replace('  ', ' ')));
  assert.deepEqual(malformed.errors.map((e) => e.rule), ['sums-invalid']);
  const selfListed = await verifyArchive(await editSums((s) => `${s}${'0'.repeat(64)}  SHA256SUMS\n`));
  assert.ok(selfListed.errors.some((e) => e.rule === 'sums-invalid'));
  const dropped = await verifyArchive(await editSums((s) => s.split('\n').filter((l) => !l.endsWith('  OPERATOR.md')).join('\n')));
  assert.ok(dropped.errors.some((e) => e.rule === 'sums-manifest-mismatch' && e.path === 'OPERATOR.md'));
  const noSums = await verifyArchive(await repacked(p, (es) => es.filter((e) => e.name !== sumsName)));
  assert.deepEqual(noSums.missing, ['SHA256SUMS']);
  assert.equal(noSums.ok, false);
  const changedMeta = await verifyArchive(await repacked(p, (es) => es.map((e) => (e.name === named(p, 'OPERATOR.md') ? { ...e, data: Buffer.from('# evil\n') } : e))));
  assert.deepEqual(changedMeta.changed, ['OPERATOR.md']);
});

test('flipped archive bytes are detected', async (t) => {
  const p = await packaged(t);
  const positions = [Math.floor(p.bytes.length / 3), Math.floor(p.bytes.length / 2), p.bytes.length - 10];
  for (const pos of positions) {
    const copy = Buffer.from(p.bytes);
    copy[pos] = /** @type {number} */ (copy[pos]) ^ 0x01;
    const file = path.join(p.out, `flip-${pos}.zip`);
    await fsp.writeFile(file, copy);
    const r = await verifyArchive(file);
    assert.equal(r.ok, false, `flip at ${pos}`);
    assert.notEqual(r.archiveSha256, p.archiveSha256);
  }
});

test('an archive that is not a kit archive (forged but disallowed content) fails verification', async (t) => {
  const p = await packaged(t);
  const r = await verifyArchive(await repacked(p, (es) => [...es, { name: named(p, 'site/.env'), data: Buffer.from('X=1') }]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.unexpected, ['site/.env']);
  const garbage = path.join(p.out, 'garbage.zip');
  await fsp.writeFile(garbage, 'not a zip at all, but long enough to have an EOCD-sized tail');
  const g = await verifyArchive(garbage);
  assert.equal(g.ok, false);
  assert.equal(g.errors[0]?.rule, 'archive-unreadable');
  assert.equal(g.errors[0]?.code, 'E_ARCHIVE');
});

test('verifyDirectory reports changed, missing and unexpected files and refuses symlinks', async (t) => {
  const p = await packaged(t);
  const dest = await tmpDir(t);
  const { topDir, result } = await extractArchive(p.archivePath, dest);
  assert.equal(result.ok, true);
  assert.equal(topDir, path.join(await fsp.realpath(dest), p.topDir));
  const clean = await verifyDirectory(topDir, { expectedContentDigest: p.manifest.content.digest });
  assert.equal(clean.ok, true, JSON.stringify(clean.errors));
  assert.equal(clean.authenticity, 'content-digest-matches-expected');
  assert.equal((await verifyDirectory(topDir)).authenticity, 'not-established');

  await fsp.writeFile(path.join(topDir, 'site', 'assets', 'app.js'), 'evil()');
  await fsp.rm(path.join(topDir, 'site', 'LICENSE'));
  await fsp.writeFile(path.join(topDir, 'site', 'extra.html'), 'x');
  await fsp.writeFile(path.join(topDir, 'OPERATOR.md'), '# changed\n');
  const r = await verifyDirectory(topDir);
  assert.equal(r.ok, false);
  assert.deepEqual(r.changed, ['OPERATOR.md', 'site/assets/app.js']);
  assert.deepEqual(r.missing, ['site/LICENSE']);
  assert.deepEqual(r.unexpected, ['site/extra.html']);

  const again = await extractArchive(p.archivePath, dest);
  await fsp.rm(path.join(again.topDir, 'site', 'index.html'));
  await fsp.symlink(path.join(p.site, 'index.html'), path.join(again.topDir, 'site', 'index.html'));
  await fsp.symlink(p.site, path.join(again.topDir, 'site', 'linked'));
  const s = await verifyDirectory(again.topDir);
  assert.equal(s.ok, false);
  assert.deepEqual(s.errors.filter((e) => e.rule === 'symlink').map((e) => e.path), ['site/index.html', 'site/linked']);
  assert.deepEqual(s.missing, ['site/index.html']);

  const edited = await extractArchive(p.archivePath, dest);
  const mpath = path.join(edited.topDir, 'HOSTING-MANIFEST.json');
  await fsp.writeFile(mpath, (await fsp.readFile(mpath, 'utf8')).replace('"label": "demo"', '"label": "evil"'));
  assert.deepEqual((await verifyDirectory(edited.topDir)).changed, ['HOSTING-MANIFEST.json']);
});

test('extractArchive refuses a tampered archive without creating anything, and replaces atomically', async (t) => {
  const p = await packaged(t);
  const dest = await tmpDir(t);
  const bad = await repacked(p, (es) => es.map((e) => (e.name === named(p, 'site/index.html') ? { ...e, data: Buffer.from('evil') } : e)));
  await assert.rejects(extractArchive(bad, dest), (/** @type {any} */ e) => e.code === 'E_VERIFY' && e.details.result.changed[0] === 'site/index.html');
  assert.deepEqual(await fsp.readdir(dest), []);
  await rejectsCode(extractArchive(p.archivePath, dest, { expectedArchiveSha256: '2'.repeat(64) }), 'E_VERIFY');
  assert.deepEqual(await fsp.readdir(dest), []);

  const first = await extractArchive(p.archivePath, dest, { expectedArchiveSha256: p.archiveSha256 });
  assert.equal(first.result.authenticity, 'archive-sha256-matches-expected');
  await fsp.writeFile(path.join(first.topDir, 'site', 'stale.txt'), 'left over from a previous extraction');
  const second = await extractArchive(p.archivePath, dest);
  assert.equal((await verifyDirectory(second.topDir)).ok, true);
  assert.deepEqual(await fsp.readdir(dest), [p.topDir]);
  for (const [rel, content] of Object.entries(goodSite())) {
    assert.deepEqual(await fsp.readFile(path.join(second.topDir, 'site', ...rel.split('/'))), Buffer.from(content));
  }
});

test('verification limits: an archive larger than the limits allow is refused before parsing', async (t) => {
  const p = await packaged(t);
  const tiny = { ...DEFAULT_LIMITS, maxTotalBytes: 10, maxDirEntries: 1, maxPathBytes: 10, maxSegmentBytes: 10 };
  const r = await verifyArchive(p.archivePath, { limits: tiny });
  assert.equal(r.ok, false);
  assert.ok(['archive-too-large', 'archive-unreadable'].includes(r.errors[0]?.rule ?? ''));
  const fewer = await verifyArchive(p.archivePath, { limits: { ...DEFAULT_LIMITS, maxFiles: 3 } });
  assert.equal(fewer.ok, false);
  assert.ok(fewer.errors.some((e) => e.code === 'E_LIMIT'));
});

test('the top-level directory must be <appId>-<label> from the manifest; a symlinked archive path is fine', async (t) => {
  const p = await packaged(t);
  const renamed = await repacked(p, (es) => es.map((e) => ({ ...e, name: `renamed/${e.name.slice(p.topDir.length + 1)}` })));
  const r = await verifyArchive(renamed);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.rule), ['top-dir-mismatch']);
  const link = path.join(p.out, 'link.zip');
  await fsp.symlink(p.archivePath, link);
  assert.equal((await verifyArchive(link)).ok, true);
});
