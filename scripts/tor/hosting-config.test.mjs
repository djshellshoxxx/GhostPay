import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareStaticTor, TOR_SOURCE_SHA256, TOR_VERSION } from '../../deploy/tor-static/prepare.mjs';
import { packageCommand } from '../../tools/portable-hosting-kit/src/cli.mjs';
import { writeDemoSite } from '../../tools/portable-hosting-kit/src/demo/demo-site.mjs';
import { defaultHostConfig } from '../../tools/portable-hosting-kit/src/config/host-config.mjs';

const runtimeCheck = fileURLToPath(new URL('../../deploy/tor-static/runtime-check.sh', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ghostpay-tor-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = join(root, 'site');
  await writeDemoSite(site);
  const archivePath = join(root, 'site.zip');
  const packaged = await packageCommand(site, archivePath, { label: 'tor-test' }, { cwd: root, env: {}, out() {}, err() {} });
  assert.equal(packaged.code, 0);
  assert.ok(packaged.result);
  return { root, site, archivePath, expectedArchiveSha256: packaged.result.archiveSha256, outDir: join(root, 'release') };
}

test('static Tor recipe preserves artifact bytes, generates no backend and removes host ports in its final override', async (t) => {
  const f = await fixture(t);
  const result = await prepareStaticTor(f);
  assert.equal(result.started, false);
  assert.equal(result.torVersion, TOR_VERSION);
  const dir = join(f.outDir, 'container');
  assert.equal(await readFile(join(dir, 'www', 'index.html'), 'utf8'), await readFile(join(f.site, 'index.html'), 'utf8'));
  const base = await readFile(join(dir, 'compose.yaml'), 'utf8');
  const tor = await readFile(join(dir, 'tor', 'compose.tor.yml'), 'utf8');
  const final = await readFile(join(dir, 'compose.onion.yaml'), 'utf8');
  assert.doesNotMatch([base, tor, final].join('\n'), /^\s+api:|relayer|\/api\//m);
  assert.match(final, /ports: !reset \[\]/);
  assert.match(final, /networks: !override \[site_internal\]/);
  assert.match(final, /condition: service_healthy/);
  assert.match(final, /target: \/etc\/tor\/expected-hostname/);
  assert.match(final, /create_host_path: false/);
  assert.equal(await readFile(join(dir, 'tor', 'expected-hostname'), 'utf8'), '');
  assert.match(await readFile(join(dir, 'compose.identity.yaml'), 'utf8'), /networks: !reset \[\]\n {4}network_mode: none/);
  assert.match(await readFile(join(dir, 'tor', 'README-TOR.md'), 'utf8'), /-f compose\.onion\.yaml config/);
  assert.match(base, /internal: true/);
  assert.match(tor, /networks: \[site_internal, tor_egress\]/);
  assert.match(tor, /tor-data:\/var\/lib\/tor/);
  assert.doesNotMatch(base, /tor-data/);
  for (const source of [base, tor]) {
    assert.match(source, /read_only: true/);
    assert.match(source, /cap_drop: \["?ALL"?\]/);
    assert.match(source, /no-new-privileges:true/);
  }
  assert.match(await readFile(join(dir, 'nginx', 'hk-server.conf'), 'utf8'), /Content-Security-Policy/);
  const torrc = await readFile(join(dir, 'tor', 'torrc'), 'utf8');
  assert.match(torrc, /HiddenServicePoWDefensesEnabled 1/);
  assert.match(torrc, /^SocksPort 0$/m);
  assert.match(torrc, /^ControlPort 0$/m);
  assert.deepEqual((await readdir(f.root)).sort(), ['release', 'site', 'site.zip', 'site.zip.sha256']);
});

test('hash mismatch refuses export and leaves original input untouched', async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.archivePath);
  await assert.rejects(prepareStaticTor({ ...f, expectedArchiveSha256: '0'.repeat(64) }), /verify|match|SHA|sha|expected/i);
  assert.deepEqual(await readFile(f.archivePath), before);
  assert.deepEqual((await readdir(f.root)).sort(), ['site', 'site.zip', 'site.zip.sha256']);
});

test('expected hash is mandatory and must be a primitive lowercase SHA-256', async (t) => {
  const f = await fixture(t);
  for (const expectedArchiveSha256 of ['', undefined, 'A'.repeat(64), [f.expectedArchiveSha256], 5]) {
    await assert.rejects(prepareStaticTor({ ...f, expectedArchiveSha256 }), /independent expected archive SHA-256/);
  }
});

test('an artifact without its response-header policy is refused before export', async (t) => {
  const f = await fixture(t);
  await rm(join(f.site, '_headers'));
  const archivePath = join(f.root, 'missing-headers.zip');
  const packaged = await packageCommand(f.site, archivePath, { label: 'no-headers' }, { cwd: f.root, env: {}, out() {}, err() {} });
  assert.equal(packaged.code, 0);
  assert.ok(packaged.result);
  await assert.rejects(prepareStaticTor({ ...f, archivePath, expectedArchiveSha256: packaged.result.archiveSha256 }), /matching _headers policy/);
  assert.equal((await readdir(f.root)).includes('release'), false);
});

test('existing output and symlink destinations are preserved', async (t) => {
  const f = await fixture(t);
  await mkdir(f.outDir);
  await writeFile(join(f.outDir, 'existing'), 'keep');
  await assert.rejects(prepareStaticTor(f), /Output already exists/);
  assert.equal(await readFile(join(f.outDir, 'existing'), 'utf8'), 'keep');
  const link = join(f.root, 'linked-release');
  await symlink(f.outDir, link, 'dir');
  await assert.rejects(prepareStaticTor({ ...f, outDir: link }), /Output already exists/);
  assert.equal(await readFile(join(f.outDir, 'existing'), 'utf8'), 'keep');
});

test('the recipe accepts only a regular archive and validated onion configuration', async (t) => {
  const f = await fixture(t);
  const archiveLink = join(f.root, 'linked.zip');
  await symlink(f.archivePath, archiveLink);
  await assert.rejects(prepareStaticTor({ ...f, archivePath: archiveLink }), /regular file/);
  await assert.rejects(prepareStaticTor({ ...f, archivePath: f.site }), /regular file/);
  await assert.rejects(prepareStaticTor({ ...f, hostConfig: defaultHostConfig('clearnet') }), /requires an onion/);
  await assert.rejects(prepareStaticTor({ ...f, hostConfig: { ...defaultHostConfig('onion'), publicOrigin: `http://${'a'.repeat(56)}.onion` } }), /onion|checksum|v3/i);
});

test('subpaths require explicit acceptance and keep files under the requested prefix', async (t) => {
  const f = await fixture(t);
  const hostConfig = { ...defaultHostConfig('onion'), basePath: '/GhostPay/' };
  await assert.rejects(prepareStaticTor({ ...f, hostConfig }), /subpath requires/);
  await prepareStaticTor({ ...f, hostConfig, allowSubpath: true });
  assert.equal(await readFile(join(f.outDir, 'container', 'www', 'GhostPay', 'index.html'), 'utf8'), await readFile(join(f.site, 'index.html'), 'utf8'));
});

test('source-pinned image checks bytes before extraction and excludes identity material from its build context', async (t) => {
  const f = await fixture(t);
  await prepareStaticTor(f);
  const torDir = join(f.outDir, 'container', 'tor');
  const dockerfile = await readFile(join(torDir, 'Dockerfile'), 'utf8');
  assert.ok(dockerfile.includes(`tor-${TOR_VERSION}.tar.gz`));
  assert.ok(dockerfile.includes(TOR_SOURCE_SHA256));
  assert.ok(dockerfile.indexOf('sha256sum --check') < dockerfile.indexOf('tar --extract'));
  assert.match(dockerfile, /--enable-gpl/);
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(dockerfile, /tor-start\.sh --check-runtime/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s|COPY\s+torrc|apt-get install[^\n]*\stor(?:\s|$)/);
  const dockerignore = (await readFile(join(torDir, '.dockerignore'), 'utf8')).split('\n').filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(dockerignore, ['**', '!Dockerfile', '!.dockerignore', '!runtime-check.sh', '!identity-check.sh', '!tor-start.sh']);
});

function checkRuntime(version, modules = 'relay: yes\npow: yes\n', gpl = true) {
  const report = `Tor version ${version}.\n${gpl ? 'This build of Tor is covered by the GNU General Public License (https://www.gnu.org/licenses/gpl-3.0.en.html)' : ''}\n`;
  return spawnSync('sh', ['-c', '. "$1"; check_tor_runtime "$2" "$3"', '_', runtimeCheck, report, modules], { encoding: 'utf8' });
}

test('runtime reports require supported stable Tor, PoW and GPL puzzles', () => {
  for (const version of ['0.4.9.17', '0.4.9.18', '0.4.10.1', '0.4.9.17 (git-0123456789abcdef)']) {
    const result = checkRuntime(version);
    assert.equal(result.status, 0, result.stderr);
  }
  for (const version of ['0.4.8.25', '0.4.9.11', '0.4.9.16', '0.4.9.17-alpha', '0.4.10.1-dev', 'unknown', '0.4.9.17.\nTor version 0.4.9.17']) {
    assert.notEqual(checkRuntime(version).status, 0);
  }
  assert.notEqual(checkRuntime('0.4.9.17', 'pow: no\n').status, 0);
  assert.notEqual(checkRuntime('0.4.9.17', 'pow: yes\n', false).status, 0);
});

test('startup scripts parse as POSIX shell and reject unsupported arguments before running Tor', () => {
  for (const name of ['runtime-check.sh', 'identity-check.sh', 'tor-start.sh']) {
    const source = fileURLToPath(new URL(`../../deploy/tor-static/${name}`, import.meta.url));
    const syntax = spawnSync('sh', ['-n', source], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  const startup = fileURLToPath(new URL('../../deploy/tor-static/tor-start.sh', import.meta.url));
  const refusal = spawnSync('sh', [startup, '--unexpected'], { encoding: 'utf8' });
  assert.equal(refusal.status, 1);
  assert.match(refusal.stderr, /Supported options/);
});

test('the configured public origin pins the read-only runtime hostname separately from the image', async (t) => {
  const f = await fixture(t);
  const hostname = '2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion';
  await prepareStaticTor({ ...f, hostConfig: { ...defaultHostConfig('onion'), publicOrigin: `http://${hostname}` } });
  assert.equal(await readFile(join(f.outDir, 'container', 'tor', 'expected-hostname'), 'utf8'), `${hostname}\n`);
  const dockerfile = await readFile(join(f.outDir, 'container', 'tor', 'Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /COPY.*expected-hostname/);
  const guide = await readFile(join(f.outDir, 'START.md'), 'utf8');
  assert.match(guide, /--initialize-identity/);
  assert.match(guide, /--check-identity/);
});

test('combined Compose model has only web and Tor, no published ports, and a private web network', async (t) => {
  const version = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) return t.skip('Docker Compose unavailable; no image build or live Tor acceptance is implied');
  const f = await fixture(t);
  await prepareStaticTor(f);
  const config = spawnSync('docker', ['compose', '-f', 'compose.yaml', '-f', 'tor/compose.tor.yml', '-f', 'compose.onion.yaml', 'config', '--format', 'json'], {
    cwd: join(f.outDir, 'container'), encoding: 'utf8',
  });
  assert.equal(config.status, 0, config.stderr);
  const model = JSON.parse(config.stdout);
  assert.deepEqual(Object.keys(model.services).sort(), ['tor', 'web']);
  assert.equal(model.services.web.ports?.length ?? 0, 0);
  assert.equal(model.services.tor.ports?.length ?? 0, 0);
  assert.deepEqual(Object.keys(model.services.web.networks), ['site_internal']);
  assert.deepEqual(Object.keys(model.services.tor.networks).sort(), ['site_internal', 'tor_egress']);
  assert.equal(model.networks.site_internal.internal, true);
});
