// @ts-check
// End-to-end tests through the CLI entry point (main) and its programmatic helpers.
// They exercise demo -> package -> verify -> preview -> profile without user-supplied files or network access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, runPreview } from '../../src/cli.mjs';
import { writeDemoSite } from '../../src/demo/demo-site.mjs';

/** Run the CLI capturing output. @param {string[]} argv @param {string} cwd */
async function cli(argv, cwd) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (s) => { out += s; }, err: (s) => { err += s; }, cwd, env: {} });
  return { code, out, err };
}

/** sha256 over every file (path + bytes) under dir, to prove a directory was not modified. @param {string} dir */
async function treeHash(dir) {
  const h = createHash('sha256');
  /** @param {string} d */
  const walk = async (d) => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else h.update(relative(dir, p)).update('\0').update(await readFile(p)).update('\0');
    }
  };
  await walk(dir);
  return h.digest('hex');
}

/** @param {(dir: string) => Promise<void>} fn */
async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'hk-int-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('demo runs the whole workflow and leaves inert profiles', async () => {
  await withTmp(async (dir) => {
    const r = await cli(['demo', '--out', 'demo'], dir);
    assert.equal(r.code, 0, r.err + r.out);
    const out = join(dir, 'demo');
    for (const f of ['demo-site.zip', 'demo-site.zip.sha256', 'DEMO-README.md', 'site/index.html',
      'profiles/clearnet-root/PROFILE-README.md', 'profiles/clearnet-root/host-config.json',
      'profiles/onion/PROFILE-README.md', 'profiles/i2p-i2pd/PROFILE-README.md', 'profiles/i2p-java/PROFILE-README.md']) {
      assert.ok(existsSync(join(out, f)), `missing ${f}`);
    }
    assert.ok((await readdir(join(out, 'profiles', 'onion', 'tor'))).length > 0, 'tor profile files');
    assert.ok((await readdir(join(out, 'profiles', 'i2p-i2pd', 'i2p'))).length > 0, 'i2pd profile files');
    assert.ok((await readdir(join(out, 'profiles', 'clearnet-root', 'nginx'))).length > 0, 'nginx profile files');
    assert.ok((await readdir(join(out, 'profiles', 'clearnet-root', 'container'))).length > 0, 'container profile files');
    assert.match(await readFile(join(out, 'profiles', 'clearnet-subpath', 'PROFILE-README.md'), 'utf8'), /WEB-APP-03/);
    // A second run replaces the kit-generated directory (marker present) and is byte-identical for the archive.
    const first = await readFile(join(out, 'demo-site.zip'));
    assert.equal((await cli(['demo', '--out', 'demo'], dir)).code, 0);
    assert.deepEqual(await readFile(join(out, 'demo-site.zip')), first, 'archive bytes reproducible across runs');
  });
});

test('package -> verify; tampering and expected digests', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const before = await treeHash(join(dir, 'site'));
    const p = await cli(['package', 'site', '--out', 'a.zip', '--label', 'v1', '--json'], dir);
    assert.equal(p.code, 0, p.err);
    const info = JSON.parse(p.out);
    assert.equal(await treeHash(join(dir, 'site')), before, 'input directory unchanged');
    assert.equal((await readFile(join(dir, 'a.zip.sha256'), 'utf8')).trim(), `${info.archiveSha256}  a.zip`);

    const v = await cli(['verify', 'a.zip', '--json'], dir);
    assert.equal(v.code, 0, v.out + v.err);
    assert.equal(JSON.parse(v.out).authenticity, 'not-established');
    const v2 = await cli(['verify', 'a.zip', '--expect-digest', info.contentDigest, '--json'], dir);
    assert.equal(JSON.parse(v2.out).authenticity, 'content-digest-matches-expected');
    const v3 = await cli(['verify', 'a.zip', '--expect-digest', `sha256:${'0'.repeat(64)}`], dir);
    assert.equal(v3.code, 1);
    const human = await cli(['verify', 'a.zip'], dir);
    assert.match(human.out, /NOT ESTABLISHED/);

    // Same input packaged again elsewhere: identical archive bytes.
    await cp(join(dir, 'site'), join(dir, 'copy'), { recursive: true });
    assert.equal((await cli(['package', 'copy', '--out', 'b.zip', '--label', 'v1'], dir)).code, 0);
    assert.deepEqual(await readFile(join(dir, 'b.zip')), await readFile(join(dir, 'a.zip')));

    // Flip one byte inside the archive.
    const bytes = await readFile(join(dir, 'a.zip'));
    const at = Math.floor(bytes.length / 3);
    bytes.writeUInt8(bytes.readUInt8(at) ^ 0xff, at);
    await writeFile(join(dir, 'bad.zip'), bytes);
    assert.equal((await cli(['verify', 'bad.zip'], dir)).code, 1);
  });
});

test('package refuses secrets and leaves the input and any previous archive untouched', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    const good = await readFile(join(dir, 'a.zip'));
    await writeFile(join(dir, 'site', '.env'), 'API_TOKEN=abc\n');
    await mkdir(join(dir, 'site', 'onion'));
    await writeFile(join(dir, 'site', 'onion', 'hs_ed25519_secret_key'), '== ed25519v1-secret: type0 ==\0\0\0');
    const before = await treeHash(join(dir, 'site'));
    const r = await cli(['package', 'site', '--out', 'a.zip'], dir);
    assert.equal(r.code, 1);
    assert.match(r.err, /E_SECRET/);
    assert.deepEqual(await readFile(join(dir, 'a.zip')), good, 'previous archive intact');
    assert.equal(await treeHash(join(dir, 'site')), before);
    const val = await cli(['validate', 'site', '--json'], dir);
    assert.equal(val.code, 1);
    const rules = JSON.parse(val.out).findings.map((/** @type {{ rule: string }} */ f) => f.rule);
    assert.ok(rules.includes('tor-onion-identity'), rules.join(','));
    assert.ok(rules.includes('credentials-or-env'), rules.join(','));
  });
});

test('preview serves the verified archive on loopback with headers, deep links and 404s', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    await assert.rejects(runPreview(join(dir, 'a.zip'), { host: '0.0.0.0', port: '0' }), (e) => /** @type {{ code?: string }} */ (e).code === 'E_NETWORK_SCOPE');
    const h = await runPreview(join(dir, 'a.zip'), { port: '0' });
    try {
      assert.match(h.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
      const root = await fetch(h.url);
      assert.equal(root.status, 200);
      assert.match(root.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/);
      assert.match(root.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
      assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
      const html = await root.text();
      const deep = await fetch(new URL('settings', h.url));
      assert.equal(deep.status, 200);
      assert.equal(await deep.text(), html, 'deep link serves the entrypoint');
      const js = html.match(/src="\.\/(assets\/demo-[0-9a-f]+\.js)"/)?.[1];
      assert.ok(js);
      const asset = await fetch(new URL(js, h.url));
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type') ?? '', /^text\/javascript/);
      assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
      await asset.arrayBuffer();
      for (const p of ['missing.js', '_headers', '.well-known/../_headers', '.env']) {
        const r = await fetch(new URL(p, h.url));
        assert.equal(r.status, 404, p);
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff', `security headers on 404 for ${p}`);
        await r.arrayBuffer();
      }
      const wk = await fetch(new URL('.well-known/security.txt', h.url));
      assert.equal(wk.status, 200);
      await wk.arrayBuffer();
      const post = await fetch(h.url, { method: 'POST', body: 'x' });
      assert.equal(post.status, 405);
      await post.arrayBuffer();
    } finally {
      await h.close();
    }
  });
});

test('profile: config validation, shared-origin guard, output-dir guard, onion and i2p', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    /** @param {string} name @param {Record<string, unknown>} c */
    const cfg = async (name, c) => writeFile(join(dir, name), JSON.stringify({ schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'm', onionLocation: null, ...c }));
    await cfg('root.json', {});
    await cfg('sub.json', { basePath: '/mirror/' });
    await cfg('onion.json', { transport: 'onion' });
    await cfg('i2p.json', { transport: 'i2p' });
    await cfg('bad.json', { listen: { kind: 'tcp', host: '0.0.0.0', port: 8080 } });
    await cfg('trust.json', { chainId: 1 });

    assert.equal((await cli(['profile', 'a.zip', '--config', 'root.json', '--out', 'p'], dir)).code, 0);
    assert.ok(existsSync(join(dir, 'p', 'static')));
    const sub = await cli(['profile', 'a.zip', '--config', 'sub.json', '--out', 'p2'], dir);
    assert.equal(sub.code, 2);
    assert.match(sub.err, /WEB-APP-03/);
    assert.equal((await cli(['profile', 'a.zip', '--config', 'sub.json', '--out', 'p2', '--allow-shared-origin'], dir)).code, 0);
    assert.equal((await cli(['profile', 'a.zip', '--config', 'onion.json', '--out', 'po'], dir)).code, 0);
    assert.ok((await readdir(join(dir, 'po', 'tor'))).length > 0);
    for (const router of ['i2pd', 'java-i2p']) {
      const r = await cli(['profile', 'a.zip', '--config', 'i2p.json', '--out', `pi-${router}`, '--i2p-router', router], dir);
      assert.equal(r.code, 0, r.err);
    }
    assert.equal((await cli(['profile', 'a.zip', '--config', 'bad.json', '--out', 'pb'], dir)).code, 1);
    const t = await cli(['profile', 'a.zip', '--config', 'trust.json', '--out', 'pt'], dir);
    assert.equal(t.code, 1);
    assert.match(t.err, /trust configuration/);
    assert.equal((await cli(['profile', 'a.zip', '--config', 'root.json', '--out', 'p', '--with', 'tor'], dir)).code, 2);

    // Never replace a directory the kit did not generate.
    await mkdir(join(dir, 'mine'));
    await writeFile(join(dir, 'mine', 'notes.txt'), 'operator data');
    const guard = await cli(['profile', 'a.zip', '--config', 'root.json', '--out', 'mine'], dir);
    assert.equal(guard.code, 2);
    assert.equal(await readFile(join(dir, 'mine', 'notes.txt'), 'utf8'), 'operator data');
    // Re-running into a kit-generated directory replaces it.
    assert.equal((await cli(['profile', 'a.zip', '--config', 'root.json', '--out', 'p'], dir)).code, 0);
  });
});

test('wizard: non-interactive writes a validated config; dry-run writes nothing', async () => {
  await withTmp(async (dir) => {
    const dry = await cli(['wizard', '--non-interactive', '--transport', 'onion', '--out', 'h.json', '--dry-run'], dir);
    assert.equal(dry.code, 0);
    assert.equal(existsSync(join(dir, 'h.json')), false);
    assert.equal((await cli(['wizard', '--non-interactive', '--transport', 'onion', '--out', 'h.json'], dir)).code, 0);
    assert.equal(JSON.parse(await readFile(join(dir, 'h.json'), 'utf8')).transport, 'onion');
    assert.equal((await cli(['wizard', '--non-interactive', '--transport', 'onion', '--out', 'h.json'], dir)).code, 2, 'no silent overwrite');
    assert.equal((await cli(['wizard', '--non-interactive', '--transport', 'clearnet', '--public-origin', 'http://x.org'], dir)).code, 1);
  });
});

test('usage errors and help', async () => {
  assert.equal((await cli([], process.cwd())).code, 2);
  assert.equal((await cli(['--help'], process.cwd())).code, 0);
  assert.equal((await cli(['nope'], process.cwd())).code, 2);
  assert.equal((await cli(['package', 'x'], process.cwd())).code, 2);
  assert.equal((await cli(['verify', '--bogus'], process.cwd())).code, 2);
});

// Qualification of the real GhostPay web build when one exists locally (npm run build -w @ghostpay/web).
const webDist = fileURLToPath(new URL('../../../../apps/web/dist/', import.meta.url));
test('real GhostPay apps/web/dist: validate, package, verify, preview', { skip: existsSync(join(webDist, 'index.html')) ? false : 'apps/web/dist not built' }, async () => {
  await withTmp(async (dir) => {
    const before = await treeHash(webDist);
    const val = await cli(['validate', webDist, '--json'], dir);
    assert.equal(val.code, 0, val.out);
    const report = JSON.parse(val.out);
    assert.equal(report.headerSource, 'site', 'GhostPay _headers is used, not the kit default');
    const p = await cli(['package', webDist, '--out', 'ghostpay-web.zip', '--label', 'local', '--json'], dir);
    assert.equal(p.code, 0, p.err);
    assert.equal(await treeHash(webDist), before, 'apps/web/dist unchanged');
    assert.equal((await cli(['verify', 'ghostpay-web.zip'], dir)).code, 0);
    const h = await runPreview(join(dir, 'ghostpay-web.zip'), { port: '0' });
    try {
      const r = await fetch(h.url);
      assert.equal(r.status, 200);
      const want = (await readFile(join(webDist, '_headers'), 'utf8')).match(/Content-Security-Policy: (.*)/)?.[1];
      assert.equal(r.headers.get('content-security-policy'), want, 'GhostPay CSP served unchanged');
      await r.arrayBuffer();
    } finally {
      await h.close();
    }
    assert.ok((await stat(join(dir, 'ghostpay-web.zip'))).size > 0);
  });
});
