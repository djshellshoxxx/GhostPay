import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'normalize-sbom.mjs');
const EPOCH = '1700000000';
const REL = 'vendor/viem-2.22.14-ghostpay-deps2.tgz';
const KEY = 'node_modules/@0xbow/privacy-pools-core-sdk/node_modules/viem';
const ARCHIVE = Buffer.from('synthetic ghostpay archive bytes\n');
const sha = (b, a) => createHash(a).update(b).digest();
const INTEGRITY = 'sha512-' + sha(ARCHIVE, 'sha512').toString('base64');
const SHA512_HEX = sha(ARCHIVE, 'sha512').toString('hex');
const roots = [];

function cleanEnv() {
  const env = {};
  for (const k of ['PATH', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP']) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

function makeRoot(depth, opts = {}) {
  let base = realpathSync(mkdtempSync(join(tmpdir(), 'gp-sbom-')));
  roots.push(base);
  let root = base;
  for (let i = 0; i < depth; i++) root = join(root, 'd' + i);
  root = join(root, 'ghostpay');
  mkdirSync(join(root, 'vendor'), { recursive: true });
  writeFileSync(join(root, REL), opts.archive ?? ARCHIVE);
  const lock = {
    name: 'ghostpay',
    lockfileVersion: 3,
    packages: {
      '': { name: 'ghostpay' },
      [KEY]: {
        version: '2.22.14+ghostpay.deps2',
        resolved: 'file:' + REL,
        integrity: opts.integrity ?? INTEGRITY
      },
      'node_modules/other': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/other/-/other-1.0.0.tgz',
        integrity: 'sha512-AAAA'
      }
    }
  };
  const lockBytes = Buffer.from(JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(join(root, 'package-lock.json'), lockBytes);
  return { root, lockSha: sha(lockBytes, 'sha256').toString('hex') };
}

function component(url, extra = {}) {
  return {
    'bom-ref': 'viem@2.22.14+ghostpay.deps2',
    type: 'library',
    name: 'viem',
    version: '2.22.14+ghostpay.deps2',
    purl: 'pkg:npm/viem@2.22.14+ghostpay.deps2',
    externalReferences: [
      { type: 'distribution', url },
      { type: 'website', url: 'https://viem.sh' }
    ],
    hashes: [{ alg: 'SHA-512', content: SHA512_HEX }],
    ...extra
  };
}

function sbomFor(c) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000000',
    metadata: { timestamp: '2020-01-01T00:00:00.000Z' },
    components: [
      c,
      {
        'bom-ref': 'other@1.0.0',
        type: 'library',
        name: 'other',
        version: '1.0.0',
        purl: 'pkg:npm/other@1.0.0',
        externalReferences: [{ type: 'distribution', url: 'https://registry.npmjs.org/other/-/other-1.0.0.tgz' }]
      }
    ],
    dependencies: [{ ref: 'viem@2.22.14+ghostpay.deps2', dependsOn: ['other@1.0.0'] }]
  };
}

function run(root, sbom, lockSha, extraArgs = []) {
  const f = join(root, 'sbom.tmp.json');
  writeFileSync(f, JSON.stringify(sbom));
  return spawnSync(process.execPath, [SCRIPT, f, lockSha, EPOCH, ...extraArgs], { cwd: root, env: cleanEnv(), encoding: 'utf8' });
}

test.after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

test('local archive distribution URL is canonical and byte-identical across clone roots', () => {
  const a = makeRoot(1);
  const b = makeRoot(4);
  const ra = run(a.root, sbomFor(component('file:' + join(a.root, REL))), a.lockSha);
  const rb = run(b.root, sbomFor(component('file:' + join(b.root, REL))), b.lockSha);
  assert.equal(ra.status, 0, ra.stderr);
  assert.equal(rb.status, 0, rb.stderr);
  assert.equal(ra.stdout, rb.stdout);
  const out = JSON.parse(ra.stdout);
  const c = out.components[0];
  assert.equal(c.externalReferences[0].url, 'file:' + REL);
  assert.equal(c.externalReferences[1].url, 'https://viem.sh');
  assert.equal(c.hashes[0].content, SHA512_HEX);
  assert.equal(c['bom-ref'], 'viem@2.22.14+ghostpay.deps2');
  assert.equal(c.purl, 'pkg:npm/viem@2.22.14+ghostpay.deps2');
  assert.equal(out.components[1].externalReferences[0].url, 'https://registry.npmjs.org/other/-/other-1.0.0.tgz');
  assert.deepEqual(out.dependencies, [{ ref: 'viem@2.22.14+ghostpay.deps2', dependsOn: ['other@1.0.0'] }]);
  assert.equal(out.metadata.timestamp, new Date(Number(EPOCH) * 1000).toISOString());
  assert.match(out.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('no local references: output unchanged apart from existing normalization, even without lock', () => {
  const a = makeRoot(1);
  const sbom = sbomFor(component('https://registry.npmjs.org/viem/-/viem-2.22.14.tgz'));
  rmSync(join(a.root, 'package-lock.json'));
  const r = run(a.root, sbom, 'a'.repeat(64));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.components[0].externalReferences[0].url, 'https://registry.npmjs.org/viem/-/viem-2.22.14.tgz');
  assert.equal(out.metadata.timestamp, new Date(Number(EPOCH) * 1000).toISOString());
});

test('existing foreign archive outside the repo root is never normalized and fails', () => {
  const a = makeRoot(1);
  const other = makeRoot(1);
  const foreignPath = join(other.root, REL);
  const foreign = 'file:' + foreignPath;
  const r = run(a.root, sbomFor(component(foreign)), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /outside repository vendor directory/);
  assert.equal(r.stdout, '');
  assert.ok(!r.stdout.includes('file:' + REL));
});

test('symlink under vendor escaping the repo root is rejected', () => {
  const a = makeRoot(1);
  const other = makeRoot(1);
  const link = join(a.root, 'vendor', 'escape.tgz');
  symlinkSync(join(other.root, REL), link);
  const r = run(a.root, sbomFor(component('file:' + link)), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /outside repository vendor directory/);
  assert.equal(r.stdout, '');
});

test('CLI is idempotent: second pass over canonical relative output is byte-identical', () => {
  const a = makeRoot(1);
  const first = run(a.root, sbomFor(component('file:' + join(a.root, REL))), a.lockSha);
  assert.equal(first.status, 0, first.stderr);
  const second = run(a.root, JSON.parse(first.stdout), a.lockSha);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
  const c = JSON.parse(second.stdout).components[0];
  assert.equal(c.externalReferences[0].url, 'file:' + REL);
  assert.equal(c.hashes[0].content, SHA512_HEX);
  assert.equal(c.purl, 'pkg:npm/viem@2.22.14+ghostpay.deps2');
  assert.equal(c['bom-ref'], 'viem@2.22.14+ghostpay.deps2');
});

test('canonical relative reference with wrong archive digest or traversal still fails', () => {
  const a = makeRoot(1, { archive: Buffer.from('tampered archive') });
  const r = run(a.root, sbomFor(component('file:' + REL)), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /integrity/i);
  const b = makeRoot(1);
  const t = run(b.root, sbomFor(component('file:vendor/../vendor/viem-2.22.14-ghostpay-deps2.tgz')), b.lockSha);
  assert.notEqual(t.status, 0);
  assert.equal(t.stdout, '');
});

test('archive digest mismatch fails clearly', () => {
  const a = makeRoot(1, { archive: Buffer.from('tampered archive') });
  const r = run(a.root, sbomFor(component('file:' + join(a.root, REL))), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /integrity/i);
  assert.equal(r.stdout, '');
});

test('component hash mismatch fails clearly', () => {
  const a = makeRoot(1);
  const c = component('file:' + join(a.root, REL), { hashes: [{ alg: 'SHA-512', content: 'ab'.repeat(64) }] });
  const r = run(a.root, sbomFor(c), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});

test('component identity mismatch fails clearly', () => {
  const a = makeRoot(1);
  const c = component('file:' + join(a.root, REL), { version: '9.9.9', purl: 'pkg:npm/viem@9.9.9' });
  const r = run(a.root, sbomFor(c), a.lockSha);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});

test('wrong lockSha fails clearly', () => {
  const a = makeRoot(1);
  const r = run(a.root, sbomFor(component('file:' + join(a.root, REL))), 'f'.repeat(64));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /lock/i);
  assert.equal(r.stdout, '');
});

test('ambiguous match (duplicate component with same identity) fails clearly', () => {
  const a = makeRoot(1);
  const url = 'file:' + join(a.root, REL);
  const sbom = sbomFor(component(url));
  sbom.components.push(component(url));
  const r = run(a.root, sbom, a.lockSha);
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});

test('usage error with bad args keeps exit code 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'x.json', 'nothex', EPOCH], { env: cleanEnv(), encoding: 'utf8' });
  assert.equal(r.status, 2);
});
