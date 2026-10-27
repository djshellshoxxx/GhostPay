// @ts-check
// Regression tests for the independent review of the CLI (findings 4, 7, 8, 10 and the profile writeAll bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, termSafe, metadataWarnings } from '../../src/cli.mjs';
import { writeDemoSite } from '../../src/demo/demo-site.mjs';

/** @param {string[]} argv @param {string} cwd */
async function cli(argv, cwd) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (s) => { out += s; }, err: (s) => { err += s; }, cwd, env: {} });
  return { code, out, err };
}

/** @param {(dir: string) => Promise<void>} fn */
async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'hk-hard-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('termSafe neutralises terminal control and bidi characters', () => {
  assert.equal(termSafe('ok\u001b[1A\u001b[2KOK digest matches'), 'ok\\u001b[1A\\u001b[2KOK digest matches');
  assert.equal(termSafe('a\u202eb\u0085c\nd'), 'a\\u202eb\\u0085c\\u000ad');
  assert.equal(termSafe('plain/path.js'), 'plain/path.js');
});

test('metadataWarnings flags top-level files the kit never writes', () => {
  const m = /** @type {import('../../src/types.mjs').HostingManifest} */ (/** @type {unknown} */ ({ metadataFiles: ['EXTERNAL-REFERENCES.json', 'HOSTING-MANIFEST.json', 'LICENSES/THIRD_PARTY.md', 'OPERATOR.md', 'install.sh'] }));
  const w = metadataWarnings(m);
  assert.equal(w.length, 1);
  assert.match(w[0] ?? '', /install\.sh/);
});

test('--git-dir does not execute repository-configured fsmonitor commands (review finding 4)', { skip: (() => { try { execFileSync('git', ['--version']); return false; } catch { return 'git not installed'; } })() }, async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const repo = join(dir, 'repo');
    await mkdir(repo);
    const marker = join(dir, 'PWNED');
    const g = (/** @type {string[]} */ ...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
    g('init', '-q');
    await writeFile(join(repo, 'f.txt'), 'x');
    g('add', 'f.txt');
    g('-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x');
    g('config', 'core.fsmonitor', `touch ${marker}; false`);
    const r = await cli(['package', 'site', '--out', 'a.zip', '--git-dir', 'repo', '--json'], dir);
    assert.equal(r.code, 0, r.err);
    assert.equal(existsSync(marker), false, 'fsmonitor command must not run');
  });
});

test('--git-dir does not run clean filters selected by the repository (review pass 2, finding 4 bypass)', { skip: (() => { try { execFileSync('git', ['--version']); return false; } catch { return 'git not installed'; } })() }, async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const repo = join(dir, 'repo');
    await mkdir(repo);
    const marker = join(dir, 'PWNED-FILTER');
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const g = (/** @type {string[]} */ ...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore', env });
    g('init', '-q');
    await writeFile(join(repo, '.gitattributes'), '* filter=evil\n');
    await writeFile(join(repo, 'f.txt'), 'x');
    g('add', '.gitattributes', 'f.txt');
    g('-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x');
    g('config', 'filter.evil.clean', `touch ${marker}; cat`);
    // Make the tracked file stat-dirty so `git status` would re-run the clean filter.
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(join(repo, 'f.txt'), 'x');
    const r = await cli(['package', 'site', '--out', 'a.zip', '--git-dir', 'repo', '--json'], dir);
    assert.equal(r.code, 0, r.err);
    assert.equal(existsSync(marker), false, 'clean filter must not run');
  });
});

test('--license-file goes through the inclusion policy and secret scan (review finding 10)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    await writeFile(join(dir, 'id_rsa'), '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n');
    await writeFile(join(dir, 'NOTICE.txt'), 'token: ghp_' + 'a'.repeat(36) + '\n');
    await writeFile(join(dir, 'THIRD_PARTY.md'), '# third party\n');
    const a = await cli(['package', 'site', '--out', 'a.zip', '--license-file', 'id_rsa'], dir);
    assert.notEqual(a.code, 0);
    assert.match(a.err, /E_SECRET|E_POLICY/);
    const b = await cli(['package', 'site', '--out', 'a.zip', '--license-file', 'NOTICE.txt'], dir);
    assert.equal(b.code, 1);
    assert.match(b.err, /E_SECRET/);
    assert.equal(existsSync(join(dir, 'a.zip')), false);
    const c = await cli(['package', 'site', '--out', 'a.zip', '--license-file', 'THIRD_PARTY.md'], dir);
    assert.equal(c.code, 0, c.err);
  });
});

test('verify output: digest match is scoped to site files; injected names are escaped (review findings 7, 8)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const p = JSON.parse((await cli(['package', 'site', '--out', 'a.zip', '--json'], dir)).out);
    const v = await cli(['verify', 'a.zip', '--expect-digest', p.contentDigest], dir);
    assert.equal(v.code, 0);
    assert.match(v.out, /does NOT cover OPERATOR\.md/);
    const j = JSON.parse((await cli(['verify', 'a.zip', '--expect-digest', p.contentDigest, '--json'], dir)).out);
    assert.equal(j.authenticityScope, 'site-files-only');
    // A file name carrying escape sequences must be printed escaped.
    await mkdir(join(dir, 'bad'));
    await writeFile(join(dir, 'bad', 'index.html'), '<!doctype html>');
    await writeFile(join(dir, 'bad', 'x\u001b[2K.html'), 'x');
    const val = await cli(['validate', 'bad'], dir);
    assert.equal(val.code, 1);
    assert.equal((val.out + val.err).includes('\u001b'), false, 'no raw ESC byte reaches the terminal');
  });
});

test('container profile is a self-contained stack; Tor container override validates with docker compose config', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    await writeFile(join(dir, 'o.json'), JSON.stringify({ schemaVersion: 1, transport: 'onion', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8081 }, mirrorLabel: 'o', onionLocation: null }));
    assert.equal((await cli(['profile', 'a.zip', '--config', 'o.json', '--out', 'p', '--with', 'tor', '--tor-instance', 'container'], dir)).code, 2, 'container tor needs the container profile');
    const r = await cli(['profile', 'a.zip', '--config', 'o.json', '--out', 'p', '--with', 'container,tor', '--tor-instance', 'container', '--hs-dir', '/var/lib/tor/site'], dir);
    assert.equal(r.code, 0, r.err);
    const stack = join(dir, 'p', 'container');
    for (const f of ['compose.yaml', 'nginx/nginx.conf', 'www/index.html', 'tor/torrc', 'tor/compose.tor.yml', 'tor/Dockerfile']) assert.ok(existsSync(join(stack, f)), f);
    let docker = false;
    try { execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' }); docker = true; } catch { /* not installed */ }
    if (docker) {
      const cfg = execFileSync('docker', ['compose', '-f', join(stack, 'compose.yaml'), '-f', join(stack, 'tor', 'compose.tor.yml'), 'config'], { encoding: 'utf8', cwd: stack });
      assert.match(cfg, /site_internal/);
      assert.match(cfg, /127\.0\.0\.1/);
    }
  });
});

test('validate refuses a _headers file that strips CSP/nosniff from SVG before anything is packaged (review pass 2)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const h = await readFile(join(dir, 'site', '_headers'), 'utf8');
    await writeFile(join(dir, 'site', '_headers'), `${h}\n/*.svg\n  ! Content-Security-Policy\n  ! X-Content-Type-Options\n`);
    const v = await cli(['validate', 'site', '--json'], dir);
    assert.equal(v.code, 1);
    assert.ok(JSON.parse(v.out).findings.some((/** @type {{ code: string }} */ f) => f.code === 'E_HEADERS'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 1);
    assert.equal(existsSync(join(dir, 'a.zip')), false);
  });
});

test('profile writes nested output directories (nginx/, tor/, i2p/)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    await writeFile(join(dir, 'o.json'), JSON.stringify({ schemaVersion: 1, transport: 'onion', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8081 }, mirrorLabel: 'o', onionLocation: null }));
    const r = await cli(['profile', 'a.zip', '--config', 'o.json', '--out', 'p', '--with', 'nginx,tor'], dir);
    assert.equal(r.code, 0, r.err);
    assert.ok((await readFile(join(dir, 'p', 'tor', 'onion-service.torrc'), 'utf8')).includes('HiddenServicePort 80 127.0.0.1:8081'));
  });
});
