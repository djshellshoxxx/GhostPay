// @ts-check
// Regression tests for the independent review of the CLI (findings 4, 7, 8, 10 and the profile writeAll bug) and for
// audit cluster E (L7-M3, L7-L5, L7-L2, L7-M1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, termSafe, metadataWarnings, openVerified, runPreview } from '../../src/cli.mjs';
import { extractArchive } from '../../src/core/verify.mjs';
import { writeDemoSite } from '../../src/demo/demo-site.mjs';

/** @param {string[]} argv @param {string} cwd @param {Partial<import('../../src/cli.mjs').Io>} [extra] */
async function cli(argv, cwd, extra = {}) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (s) => { out += s; }, err: (s) => { err += s; }, cwd, env: {}, ...extra });
  return { code, out, err };
}

const noGit = (() => { try { execFileSync('git', ['--version']); return false; } catch { return 'git not installed'; } })();
const CLEARNET = JSON.stringify({ schemaVersion: 1, transport: 'clearnet', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'm', onionLocation: null });

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
  const m = /** @type {import('../../src/types.mjs').HostingManifest} */ (/** @type {unknown} */ ({ metadataFiles: ['EXTERNAL-REFERENCES.json', 'HOSTING-MANIFEST.json', 'LICENSES/HOSTING-KIT-NOTICE.txt', 'LICENSES/THIRD_PARTY.md', 'LICENSES/sbom.cdx.json', 'LICENSES/COPYING', 'LICENSES/install.sh', 'OPERATOR.md', 'install.sh'] }));
  const w = metadataWarnings(m);
  assert.equal(w.length, 2);
  assert.ok(w.some((x) => x.includes('"LICENSES/install.sh"')) && w.some((x) => x.includes('"install.sh"')));
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
    // Since audit L7-L2 a repository that configures any filter driver is refused before `git status` runs.
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /E_UNSUPPORTED.*filter\.evil\.clean/);
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

test('profile and preview of an archive enforce --expect-sha256 and --expect-digest (audit L7-M3)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const p = JSON.parse((await cli(['package', 'site', '--out', 'a.zip', '--json'], dir)).out);
    await writeFile(join(dir, 'h.json'), CLEARNET);
    const cases = [
      { flag: '--expect-sha256', value: 'f'.repeat(64), msg: /E_VERIFY: archive sha256 [0-9a-f]{64} does not match --expect-sha256 f{64}/ },
      { flag: '--expect-digest', value: `sha256:${'e'.repeat(64)}`, msg: /E_VERIFY: content digest sha256:[0-9a-f]{64} does not match --expect-digest sha256:e{64}/ },
    ];
    for (const c of cases) {
      const r = await cli(['profile', 'a.zip', '--config', 'h.json', '--out', 'p', c.flag, c.value], dir);
      assert.equal(r.code, 1, `profile ${c.flag}: ${r.err}`);
      assert.match(r.err, c.msg);
      assert.equal(existsSync(join(dir, 'p')), false, 'nothing generated on a mismatch');
      let served = false;
      const pv = await cli(['preview', 'a.zip', '--port', '0', c.flag, c.value], dir, { waitForStop: async () => { served = true; } });
      assert.equal(pv.code, 1, `preview ${c.flag}: ${pv.err}`);
      assert.match(pv.err, c.msg);
      assert.equal(served, false, 'preview never starts on a mismatch');
    }
    assert.equal((await cli(['profile', 'a.zip', '--config', 'h.json', '--out', 'p', '--expect-sha256', 'abc'], dir)).code, 2, 'malformed --expect-sha256');
    assert.equal((await cli(['preview', 'a.zip', '--expect-digest', 'nope'], dir)).code, 2, 'malformed --expect-digest');
    const ok = await cli(['profile', 'a.zip', '--config', 'h.json', '--out', 'p', '--expect-sha256', p.archiveSha256, '--expect-digest', p.contentDigest], dir);
    assert.equal(ok.code, 0, ok.err);
    let served = false;
    const pv = await cli(['preview', 'a.zip', '--port', '0', '--expect-sha256', p.archiveSha256], dir, { waitForStop: async () => { served = true; } });
    assert.equal(pv.code, 0, pv.err);
    assert.equal(served, true);
  });
});

test('commands refuse options they do not use; documented usages still work (audit L7-M3 hardening)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const sha = 'a'.repeat(64);
    for (const argv of [
      ['package', 'site', '--out', 'x.zip', '--expect-sha256', sha],
      ['package', 'site', '--out', 'x.zip', '--expect-digest', `sha256:${sha}`],
      ['validate', 'site', '--expect-digest', `sha256:${sha}`],
      ['validate', 'site', '--out', 'x.zip'],
      ['verify', 'x.zip', '--port', '1'],
      ['wizard', '--non-interactive', '--transport', 'onion', '--expect-sha256', sha],
    ]) {
      const r = await cli(argv, dir);
      assert.equal(r.code, 2, `${argv.join(' ')}: ${r.err}`);
      assert.match(r.err, /E_USAGE: --[a-z0-9-]+ does not apply to "[a-z]+"/);
    }
    assert.equal(existsSync(join(dir, 'x.zip')), false);
    assert.equal((await cli(['validate', 'site', '--json', '--max-files', '100', '--allow-source-maps'], dir)).code, 0);
    const p = await cli(['package', 'site', '--out', 'a.zip', '--json', '--label', 'v1', '--app-id', 'demo', '--note', 'n', '--compression', 'store', '--source-date-epoch', '0'], dir);
    assert.equal(p.code, 0, p.err);
    assert.equal((await cli(['verify', 'a.zip', '--json', '--expect-digest', JSON.parse(p.out).contentDigest], dir)).code, 0);
    assert.equal((await cli(['wizard', '--non-interactive', '--transport', 'onion', '--dry-run', '--json'], dir)).code, 0);
  });
});

test('an unpacked directory is copied before it is verified and used (audit L7-L5)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    const { topDir } = await extractArchive(join(dir, 'a.zip'), join(dir, 'unpacked'));
    const index = join(topDir, 'site', 'index.html');
    const original = await readFile(index, 'utf8');
    const swapped = '<!doctype html><title>swapped after verification</title>';

    const opened = await openVerified(topDir, {});
    try {
      assert.equal(opened.siteDir.startsWith(`${topDir}/`), false, 'the site is read from a private copy');
      await writeFile(index, swapped);
      assert.equal(await readFile(join(opened.siteDir, 'index.html'), 'utf8'), original, 'a later write to the input is not seen');
    } finally {
      await opened.cleanup();
    }
    assert.equal(existsSync(opened.topDir), false, 'the copy is removed');

    await writeFile(index, original);
    const h = await runPreview(topDir, { port: '0' });
    try {
      await writeFile(index, swapped);
      const r = await fetch(h.url);
      assert.equal(r.status, 200);
      assert.equal(await r.text(), original, 'preview serves the verified bytes, not the swapped file');
    } finally {
      await h.close();
    }

    await writeFile(index, original);
    await writeFile(join(dir, 'h.json'), CLEARNET);
    const prof = await cli(['profile', 'unpacked/' + topDir.split('/').pop(), '--config', 'h.json', '--out', 'p', '--with', 'static'], dir);
    assert.equal(prof.code, 0, prof.err);
    assert.equal(await readFile(join(dir, 'p', 'static', 'www', 'index.html'), 'utf8'), original);

    // Still refused: a symlink anywhere in the input, and --expect-sha256 for a directory.
    await symlink('/etc/hostname', join(topDir, 'site', 'linked.txt'));
    await assert.rejects(openVerified(topDir, {}), (e) => /** @type {{ code?: string }} */ (e).code === 'E_VERIFY');
    assert.equal((await cli(['preview', topDir, '--expect-sha256', 'a'.repeat(64)], dir)).code, 2);
  });
});

test('--git-dir refuses filter drivers assigned through $GIT_DIR/info/attributes (audit L7-L2)', { skip: noGit }, async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const repo = join(dir, 'repo');
    await mkdir(repo);
    const marker = join(dir, 'PWNED-INFO-ATTRIBUTES');
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const g = (/** @type {string[]} */ ...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore', env });
    g('init', '-q');
    await writeFile(join(repo, 'f.txt'), 'x');
    g('add', 'f.txt');
    g('-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x');
    // --attr-source covers .gitattributes, not $GIT_DIR/info/attributes.
    await writeFile(join(repo, '.git', 'info', 'attributes'), '* filter=evil\n');
    g('config', 'filter.evil.clean', `touch ${marker}; cat`);
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(join(repo, 'f.txt'), 'x');
    const r = await cli(['package', 'site', '--out', 'a.zip', '--git-dir', 'repo', '--json'], dir);
    assert.equal(existsSync(marker), false, 'clean filter must not run');
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /E_UNSUPPORTED.*filter driver/);
    assert.equal(existsSync(join(dir, 'a.zip')), false, 'nothing packaged');
  });
});

test('--git-dir does not descend into submodules, whose own config could run filters (audit L7-L2)', { skip: noGit }, async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const git = (/** @type {string} */ cwd, /** @type {string[]} */ ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env });
    const commit = (/** @type {string} */ cwd) => git(cwd, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x');
    const sub = join(dir, 'sub');
    const repo = join(dir, 'repo');
    await mkdir(sub);
    await mkdir(repo);
    git(sub, 'init', '-q');
    await writeFile(join(sub, 's.txt'), 'y');
    git(sub, 'add', 's.txt');
    commit(sub);
    git(repo, 'init', '-q');
    await writeFile(join(repo, 'top.txt'), 'z');
    git(repo, 'add', 'top.txt');
    git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'sm');
    commit(repo);
    const marker = join(dir, 'PWNED-SUBMODULE');
    const subGitDir = git(join(repo, 'sm'), 'rev-parse', '--absolute-git-dir').trim();
    await writeFile(join(subGitDir, 'info', 'attributes'), '* filter=evil\n');
    git(join(repo, 'sm'), 'config', 'filter.evil.clean', `touch ${marker}; cat`);
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(join(repo, 'sm', 's.txt'), 'y');
    const r = await cli(['package', 'site', '--out', 'a.zip', '--git-dir', 'repo', '--json'], dir);
    assert.equal(existsSync(marker), false, 'the submodule clean filter must not run');
    assert.equal(r.code, 0, r.err);
  });
});

test('profile --with static warns that static/www carries no _headers (audit L7-M1)', async () => {
  await withTmp(async (dir) => {
    await writeDemoSite(join(dir, 'site'));
    assert.equal((await cli(['package', 'site', '--out', 'a.zip'], dir)).code, 0);
    await writeFile(join(dir, 'h.json'), CLEARNET);
    const r = await cli(['profile', 'a.zip', '--config', 'h.json', '--out', 'p', '--with', 'static'], dir);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /warn static\/www omits _headers/);
    assert.equal(existsSync(join(dir, 'p', 'static', 'www', '_headers')), false);
    const readme = await readFile(join(dir, 'p', 'PROFILE-README.md'), 'utf8');
    assert.match(readme, /static\/www omits _headers/);
    assert.match(readme, /no `_headers` file/);
    const n = await cli(['profile', 'a.zip', '--config', 'h.json', '--out', 'pn', '--with', 'nginx'], dir);
    assert.equal(n.code, 0, n.err);
    assert.doesNotMatch(n.out, /omits _headers/, 'no static warning without the static profile');
  });
});
