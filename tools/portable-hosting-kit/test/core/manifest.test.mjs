// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBytes } from '../../src/core/canonical-json.mjs';
import { sha256Hex } from '../../src/core/hash.mjs';
import { buildManifest, contentDigest, parseManifest, serializeManifest } from '../../src/core/manifest.mjs';
import { DEFAULT_LIMITS } from '../../src/policy.mjs';
import { KIT_VERSION } from '../../src/version.mjs';
import { throwsCode } from './helpers.mjs';

/** @typedef {import('../../src/types.mjs').HostingManifest} HostingManifest */

const H = (/** @type {string} */ c) => c.repeat(64);

function input() {
  return {
    appId: 'ghostpay-web',
    entrypoint: 'index.html',
    records: [
      { path: 'index.html', size: 10, sha256: H('a') },
      { path: 'assets/app.js', size: 5, sha256: H('b') },
      { path: 'deployments/8453.json', size: 2, sha256: H('c') },
    ],
    limits: DEFAULT_LIMITS,
    allowSourceMaps: false,
    provenance: { label: 'v0.1.0', sourceDateEpoch: 1700000000, source: /** @type {const} */ ({ kind: 'git', commit: '0123456789abcdef0123456789abcdef01234567', dirty: false }), notes: ['n'] },
    trustSensitive: ['deployments/8453.json'],
    metadataFiles: ['OPERATOR.md', 'HOSTING-MANIFEST.json'],
  };
}

/**
 * @param {(m: any) => void} edit
 * @returns {Uint8Array}
 */
function edited(edit) {
  const m = JSON.parse(Buffer.from(serializeManifest(buildManifest(input()))).toString('utf8'));
  edit(m);
  return Buffer.from(`${JSON.stringify(m, null, 2)}\n`);
}

test('content digest is sha256 over canonical { entrypoint, files } sorted by UTF-8 path', () => {
  const recs = input().records;
  const sorted = [recs[1], recs[2], recs[0]];
  const expected = `sha256:${sha256Hex(canonicalBytes({ entrypoint: 'index.html', files: sorted }))}`;
  assert.equal(contentDigest('index.html', recs), expected);
  assert.equal(contentDigest('index.html', [...recs].reverse()), expected);
  assert.notEqual(contentDigest('other.html', recs), expected);
});

test('buildManifest produces the v1 layout with sorted lists and no wall-clock time', () => {
  const m = buildManifest(input());
  assert.equal(m.schema, 'ghostpay.hosting-kit.manifest');
  assert.equal(m.schemaVersion, 1);
  assert.deepEqual(m.kit, { name: 'ghostpay-portable-hosting-kit', version: KIT_VERSION });
  assert.deepEqual(m.content.files.map((f) => f.path), ['assets/app.js', 'deployments/8453.json', 'index.html']);
  assert.equal(m.content.fileCount, 3);
  assert.equal(m.content.totalBytes, 17);
  assert.equal(m.content.root, 'site/');
  assert.deepEqual(m.metadataFiles, ['HOSTING-MANIFEST.json', 'OPERATOR.md']);
  assert.equal(m.policy.id, 'ghostpay.static-site-policy');
});

test('serialize is deterministic (2-space indent, trailing newline) and parse round-trips', () => {
  const m = buildManifest(input());
  const bytes = serializeManifest(m);
  const text = Buffer.from(bytes).toString('utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.startsWith('{\n  "schema": "ghostpay.hosting-kit.manifest",\n  "schemaVersion": 1,'));
  assert.deepEqual(parseManifest(bytes), m);
  /** @type {any} */
  const shuffled = Object.fromEntries(Object.entries(m).reverse());
  assert.deepEqual(Buffer.from(serializeManifest(shuffled)), Buffer.from(bytes));
});

test('buildManifest rejects invalid input with E_USAGE', () => {
  throwsCode(() => buildManifest({ ...input(), appId: 'Bad App' }), 'E_USAGE', /appId/);
  throwsCode(() => buildManifest({ ...input(), entrypoint: 'missing.html' }), 'E_USAGE', /entrypoint/);
  throwsCode(() => buildManifest({ ...input(), records: [...input().records, { path: 'Index.html', size: 1, sha256: H('d') }] }), 'E_USAGE', /collides/);
  throwsCode(() => buildManifest({ ...input(), records: [...input().records, { path: '../x', size: 1, sha256: H('d') }] }), 'E_USAGE');
  throwsCode(() => buildManifest({ ...input(), metadataFiles: ['OPERATOR.md'] }), 'E_USAGE', /HOSTING-MANIFEST/);
  throwsCode(() => buildManifest({ ...input(), metadataFiles: ['HOSTING-MANIFEST.json', 'SHA256SUMS'] }), 'E_USAGE', /SHA256SUMS/);
  throwsCode(() => buildManifest({ ...input(), metadataFiles: ['HOSTING-MANIFEST.json', 'site/x'] }), 'E_USAGE');
  throwsCode(() => buildManifest({ ...input(), trustSensitive: ['nope.json'] }), 'E_USAGE', /trustSensitive/);
});

test('parseManifest is strict', () => {
  throwsCode(() => parseManifest(edited((m) => { m.schema = 'other'; })), 'E_VERIFY', /schema/);
  throwsCode(() => parseManifest(edited((m) => { m.schemaVersion = 2; })), 'E_VERIFY', /schemaVersion/);
  throwsCode(() => parseManifest(edited((m) => { m.extra = 1; })), 'E_VERIFY', /unknown field "extra"/);
  throwsCode(() => parseManifest(edited((m) => { m.content.files[0].mode = 420; })), 'E_VERIFY', /unknown field "mode"/);
  throwsCode(() => parseManifest(edited((m) => { delete m.provenance; })), 'E_VERIFY', /missing field "provenance"/);
  throwsCode(() => parseManifest(edited((m) => { m.content.files[0].sha256 = H('e'); })), 'E_VERIFY', /digest does not match/);
  throwsCode(() => parseManifest(edited((m) => { m.content.files.reverse(); })), 'E_VERIFY', /sorted/);
  throwsCode(() => parseManifest(edited((m) => { m.content.fileCount = 2; })), 'E_VERIFY', /fileCount/);
  throwsCode(() => parseManifest(edited((m) => { m.content.totalBytes = 1; })), 'E_VERIFY', /totalBytes/);
  throwsCode(() => parseManifest(edited((m) => { m.content.files[0].path = '../evil.js'; })), 'E_VERIFY');
  throwsCode(() => parseManifest(edited((m) => { m.provenance.sourceDateEpoch = 1.5; })), 'E_VERIFY', /sourceDateEpoch/);
  throwsCode(() => parseManifest(edited((m) => { m.provenance.source = { kind: 'svn' }; })), 'E_VERIFY', /source.kind/);
  throwsCode(() => parseManifest(edited((m) => { m.policy.limits.maxFiles = 0; })), 'E_VERIFY', /maxFiles/);
  const good = Buffer.from(serializeManifest(buildManifest(input())));
  throwsCode(() => parseManifest(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good])), 'E_VERIFY', /JSON/);
  throwsCode(() => parseManifest(Buffer.from([0xff, 0x7b])), 'E_VERIFY', /UTF-8/);
  // Same values, different serialization (duplicate key / whitespace) is not accepted.
  const dup = Buffer.from(good.toString('utf8').replace('"appId": "ghostpay-web",', '"appId": "evil",\n  "appId": "ghostpay-web",'));
  throwsCode(() => parseManifest(dup), 'E_VERIFY', /canonical/);
  throwsCode(() => parseManifest(Buffer.from(good.toString('utf8').replace(/\n$/, ''))), 'E_VERIFY', /canonical/);
});
