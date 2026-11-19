// Scratch-only qualification of generated Pages files and actual loopback HTTP responses.
// This does not launch a browser or establish that a declared HTTPS origin is deployed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceArg, artifactArg, base, declaredOrigin, sharedText, commit] = process.argv.slice(2);
assert(sourceArg && artifactArg && base && declaredOrigin && sharedText && commit, 'six arguments required');
const source = resolve(sourceArg);
const artifact = resolve(artifactArg);
const site = join(artifact, 'site');
const evidenceDir = join(artifact, 'evidence');
const { verifySite } = await import(pathToFileURL(join(source, 'scripts/pages/verify-pages-site.mjs')));
const { createPagesServer, MIME_TYPES } = await import(pathToFileURL(join(source, 'scripts/pages/serve-pages.mjs')));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const info = JSON.parse(await readFile(join(site, 'build-info.json'), 'utf8'));
const evidence = JSON.parse(await readFile(join(evidenceDir, 'pages-evidence.json'), 'utf8'));
const lean = JSON.parse(await readFile(join(evidenceDir, 'ghostpay-lean-build.json'), 'utf8'));
assert.equal(info.commit, commit);
assert.equal(evidence.commit, commit);
assert.equal(evidence.origin, declaredOrigin);
assert.equal(evidence.sharedOrigin, sharedText === 'true');
assert.equal(evidence.profile, 'lean');
assert.equal(evidence.base, 'relative (./)');
assert.deepEqual(evidence.paymentsEnabledChainIds, []);
assert.equal(evidence.release, true, 'artifact records release mode');
assert(evidence.status.startsWith('DEMO:'), 'these are payments-disabled qualification artifacts');
assert.equal(evidence.manifestsSha256, info.manifestsSha256);
assert.equal(evidence.lockfileSha256, sha256(await readFile(join(source, 'package-lock.json'))));
const verified = verifySite(site, lean, { expectCommit: commit, expectManifestsSha256: info.manifestsSha256 });
assert.deepEqual(verified.problems, []);
assert.equal(evidence.files, verified.files.length);

const sumsText = await readFile(join(evidenceDir, 'SHA256SUMS'), 'utf8');
assert.equal(evidence.sha256sumsSha256, sha256(sumsText));
const sums = new Map();
for (const line of sumsText.trimEnd().split('\n')) {
  const parsed = /^([0-9a-f]{64})  (.+)$/.exec(line);
  assert(parsed, 'checksum line must have an exact digest and filename');
  const [, digest, emittedName] = parsed;
  assert(emittedName.startsWith('./'), 'checksum filename must use the emitted relative prefix');
  const name = emittedName.slice(2);
  assert(name !== '' && !name.startsWith('./') && !name.startsWith('/'), 'canonical relative checksum filename');
  assert(!sums.has(name), 'duplicate checksum path');
  const path = resolve(site, name);
  assert(path.startsWith(site + sep), 'checksum path must stay inside artifact');
  assert.equal(sha256(await readFile(path)), digest, `file checksum: ${name}`);
  sums.set(name, digest);
}
assert.deepEqual([...sums.keys()].sort(), [...verified.files].sort(), 'checksums cover exactly the published files');
async function fileNames(dir, prefix = '') {
  const names = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    assert(!entry.isSymbolicLink(), 'artifact must contain no symlink');
    if (entry.isDirectory()) names.push(...await fileNames(join(dir, entry.name), name + '/'));
    else { assert(entry.isFile(), 'artifact must contain only regular files'); names.push(name); }
  }
  return names.sort();
}
assert.deepEqual(await fileNames(site), [...sums.keys()].sort());

const server = createPagesServer({ siteDir: site, base });
await new Promise((ready, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', ready);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const siteURL = new URL(base, origin);
let fetched = 0;
const securityHeaders = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'referrer-policy', 'permissions-policy', 'strict-transport-security'];
const get = (path, init = {}) => fetch(new URL(path, siteURL), { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });
try {
  const index = await get('');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^text\/html/);
  for (const name of securityHeaders) assert.equal(index.headers.get(name), null, `Pages stand-in omits ${name}`);
  const html = await index.text();
  assert.match(html, /id="gp-pages-mirror"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1];
  assert(entry?.startsWith('./'), 'entry script uses a relative resource path');
  assert(new URL(entry, siteURL).pathname.startsWith(base));
  for (const [name, digest] of sums) {
    if (name === '.nojekyll') continue; // Hosting control marker has no allowed content MIME type.
    const res = await get(name);
    assert.equal(res.status, 200, `HTTP status: ${name}`);
    assert.equal(res.headers.get('content-type'), MIME_TYPES[extname(name)], `MIME: ${name}`);
    assert.equal(sha256(Buffer.from(await res.arrayBuffer())), digest, `HTTP body: ${name}`);
    fetched += 1;
  }
  const missing = await get('qualification-absent-file');
  assert.equal(missing.status, 404);
  await missing.arrayBuffer();
  if (base !== '/') {
    const slash = await fetch(new URL(base.slice(0, -1), origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), base);
    await slash.arrayBuffer();
    const outside = await fetch(new URL('/build-info.json', origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    assert.equal(outside.status, 404);
    await outside.arrayBuffer();
  }
  console.log(JSON.stringify({
    result: 'PASS', scope: 'static artifact and loopback HTTP only', commit,
    source, artifact, base, declaredOrigin, sharedOrigin: evidence.sharedOrigin,
    hostedOriginTested: false, browserTested: false, paymentsEnabledChainIds: [],
    filesHashed: sums.size, filesFetched: fetched, markerExcludedFromHttp: '.nojekyll',
    sha256sumsSha256: evidence.sha256sumsSha256, manifestsSha256: info.manifestsSha256,
    moduleChunks: lean.chunks.length, workers: lean.workers.length,
  }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
