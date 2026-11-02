// @ts-check
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { KitError } from '../../src/errors.mjs';
import { loadHeaderPolicy, kitHeaderNames } from '../../src/serve/headers.mjs';
import { startPreview } from '../../src/serve/preview.mjs';
import { exportStatic } from '../../src/profiles/static-export.mjs';
import { generateNginx } from '../../src/profiles/nginx.mjs';
import {
  CONTAINER_IMAGE, CONTAINER_IMAGE_DIGEST, CONTAINER_NETWORK, CONTAINER_PORT, CONTAINER_SERVICE, composeProjectName, generateContainer,
} from '../../src/profiles/container.mjs';
import { buildRequest, freePort, makeFixtureSite, nginxAvailable, nginxTest, rawRequest, tempDir, writeOutFiles } from '../serve/helpers.mjs';
import { compareServers, requestCases } from './compare.mjs';

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */

/**
 * @param {Partial<HostConfig>} [over]
 * @returns {HostConfig}
 */
function hostConfig(over = {}) {
  return {
    schemaVersion: 1, transport: 'onion', publicOrigin: null, basePath: '/', listen: { kind: 'tcp', host: '127.0.0.1', port: 8088 },
    mirrorLabel: 'My Mirror!', onionLocation: null, ...over,
  };
}

/**
 * @param {HostConfig} hc
 */
async function generate(hc) {
  const { siteDir, files } = await makeFixtureSite();
  const policy = await loadHeaderPolicy(files, (p) => fs.readFile(path.join(siteDir, p), 'utf8'));
  const nginx = generateNginx({ files, entrypoint: 'index.html', hostConfig: hc, policy, wwwRoot: '/srv/unused' });
  return { siteDir, files, policy, nginx, container: generateContainer({ hostConfig: hc, nginxFiles: nginx.files }) };
}

/**
 * @param {{ files: Array<{ name: string, data: Uint8Array }> }} out
 * @param {string} name
 */
function text(out, name) {
  const f = out.files.find((x) => x.name === name);
  assert.ok(f, `missing ${name}`);
  return new TextDecoder().decode(f.data);
}

test('compose file: pinned image, frozen names, loopback publish, hardening, no secrets', async () => {
  const { siteDir, container } = await generate(hostConfig());
  await fs.rm(siteDir, { recursive: true, force: true });
  assert.deepEqual(container.files.map((f) => f.name).sort(), ['compose.yaml', 'nginx/hk-http.conf', 'nginx/hk-server.conf', 'nginx/nginx.conf']);
  const y = text(container, 'compose.yaml');
  assert.match(CONTAINER_IMAGE, /^nginxinc\/nginx-unprivileged:[0-9.]+-alpine@sha256:[0-9a-f]{64}$/);
  assert.ok(y.includes(`image: "${CONTAINER_IMAGE}"`));
  assert.ok(y.includes(CONTAINER_IMAGE_DIGEST));
  assert.equal(CONTAINER_SERVICE, 'web');
  assert.equal(CONTAINER_PORT, 8080);
  assert.equal(CONTAINER_NETWORK, 'site_internal');
  assert.match(y, /^services:\n {2}web:\n/m);
  assert.match(y, /ports:\n {6}- "127\.0\.0\.1:8088:8080"\n/);
  assert.equal((y.match(/:8080"/g) ?? []).length, 1, 'exactly one published port');
  for (const needle of ['read_only: true', 'cap_drop: ["ALL"]', 'security_opt: ["no-new-privileges:true"]', 'user: "101:101"',
    '- "/tmp:size=16m,mode=1777,noexec,nosuid,nodev"', 'mem_limit: 128m', 'pids_limit: 64', 'cpus: 0.5',
    `  ${CONTAINER_NETWORK}:\n    internal: true`, 'com.docker.network.bridge.enable_ip_masquerade: "false"', 'name: "hk-my-mirror"']) {
    assert.ok(y.includes(needle), `compose lacks ${needle}`);
  }
  assert.equal((y.match(/read_only: true/g) ?? []).length, 3, 'root fs and both mounts read-only');
  for (const banned of ['environment', 'env_file', 'secrets', 'privileged', 'network_mode', 'cap_add', 'devices', 'volumes_from']) {
    assert.ok(!new RegExp(`^\\s*${banned}:`, 'm').test(y), `compose must not contain ${banned}:`);
  }
  assert.ok(!y.includes('0.0.0.0'));
  const main = text(container, 'nginx/nginx.conf');
  assert.match(main, /listen 8080 default_server;/);
  assert.match(main, /root "\/srv\/www";/);
  assert.match(main, /pid "\/tmp\/nginx.pid";/);
  assert.equal(composeProjectName('---'), 'hk-site');
});

test('container profile: ::1 publish, unix and non-loopback listeners refused', async () => {
  const { siteDir, container } = await generate(hostConfig({ listen: { kind: 'tcp', host: '::1', port: 9000 } }));
  await fs.rm(siteDir, { recursive: true, force: true });
  assert.match(text(container, 'compose.yaml'), /- "\[::1\]:9000:8080"/);
  const g = await generate(hostConfig());
  await fs.rm(g.siteDir, { recursive: true, force: true });
  assert.throws(() => generateContainer({ hostConfig: hostConfig({ listen: { kind: 'unix', path: '/run/site.sock' } }), nginxFiles: g.nginx.files }), (e) => e instanceof KitError && e.code === 'E_UNSUPPORTED');
  assert.throws(() => generateContainer({ hostConfig: hostConfig({ listen: { kind: 'tcp', host: '0.0.0.0', port: 80 } }), nginxFiles: g.nginx.files }), (e) => e instanceof KitError && e.code === 'E_NETWORK_SCOPE');
  assert.throws(() => generateContainer({ hostConfig: hostConfig(), nginxFiles: [] }), (e) => e instanceof KitError && e.code === 'E_USAGE');
});

test('container nginx.conf passes nginx -t', { skip: (await nginxAvailable()) ? false : 'nginx binary absent' }, async () => {
  const { siteDir, container } = await generate(hostConfig({ basePath: '/m/' }));
  const dir = await tempDir('ctr-t');
  try {
    await writeOutFiles(dir, container.files);
    const r = nginxTest(path.join(dir, 'nginx', 'nginx.conf'), dir);
    assert.ok(r.ok, r.output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(siteDir, { recursive: true, force: true });
  }
});

/**
 * @param {string[]} args
 * @param {string} cwd
 * @param {number} [timeoutMs]
 */
function docker(args, cwd, timeoutMs = 300_000) {
  const r = spawnSync('docker', args, { cwd, encoding: 'utf8', timeout: timeoutMs });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
}

const DOCKER_SKIP = process.env.HK_DOCKER_TESTS === '1' ? false : 'opt-in: set HK_DOCKER_TESTS=1 (needs a Docker daemon, docker compose and access to Docker Hub)';

describe('container run (opt-in)', { skip: DOCKER_SKIP }, () => {
  const project = `hk-test-${randomBytes(4).toString('hex')}`;
  /** @type {{ dir: string, siteDir: string, port: number, previewPort: number, names: string[], basePath: string, closers: Array<() => Promise<void>> }} */
  const ctx = { dir: '', siteDir: '', port: 0, previewPort: 0, names: [], basePath: '/mirror/app/', closers: [] };

  before(async () => {
    ctx.port = await freePort();
    const hc = hostConfig({ basePath: ctx.basePath, listen: { kind: 'tcp', host: '127.0.0.1', port: ctx.port } });
    const { siteDir, files } = await makeFixtureSite();
    ctx.siteDir = siteDir;
    const policy = await loadHeaderPolicy(files, (p) => fs.readFile(path.join(siteDir, p), 'utf8'));
    ctx.names = [...kitHeaderNames(policy, hc), 'etag', 'last-modified'];
    ctx.dir = await tempDir('ctr');
    await fs.chmod(ctx.dir, 0o755); // the container runs as uid 101
    ctx.closers.push(() => fs.rm(ctx.dir, { recursive: true, force: true }), () => fs.rm(siteDir, { recursive: true, force: true }));
    const { wwwRoot } = await exportStatic({ siteDir, files, entrypoint: 'index.html', hostConfig: hc, policy, outDir: ctx.dir });
    const nginx = generateNginx({ files, entrypoint: 'index.html', hostConfig: hc, policy, wwwRoot });
    await writeOutFiles(ctx.dir, generateContainer({ hostConfig: hc, nginxFiles: nginx.files }).files);
    ctx.closers.unshift(async () => {
      const down = docker(['compose', '-p', project, 'down', '-v', '--remove-orphans', '--timeout', '5'], ctx.dir);
      assert.ok(down.ok, down.out);
    });
    const up = docker(['compose', '-p', project, 'up', '-d', '--wait', '--wait-timeout', '120'], ctx.dir);
    assert.ok(up.ok, `docker compose up failed:\n${up.out}`);
    const preview = await startPreview({ siteDir, files, entrypoint: 'index.html', basePath: ctx.basePath, policy, hostConfig: hc });
    ctx.closers.unshift(() => preview.close());
    ctx.previewPort = preview.port;
  });

  after(async () => {
    for (const close of ctx.closers) await close();
    // Nothing of this project may remain.
    const left = docker(['ps', '-a', '-q', '--filter', `label=com.docker.compose.project=${project}`], '/');
    const nets = docker(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`], '/');
    const vols = docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`], '/');
    assert.equal(`${left.stdout}${nets.stdout}${vols.stdout}`.trim(), '', 'containers, networks or volumes left behind');
  });

  test('headers over HTTP from the running container', async () => {
    const r = await rawRequest({ port: ctx.port }, buildRequest('GET', `${ctx.basePath}deep/link`));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    const missing = await rawRequest({ port: ctx.port }, buildRequest('GET', `${ctx.basePath}nope.js`));
    assert.equal(missing.status, 404);
    assert.ok(missing.headers.get('content-security-policy'));
  });

  test('preview and the containerized nginx agree on the full request matrix', async () => {
    const { mismatches, statuses } = await compareServers({ previewPort: ctx.previewPort, otherPort: ctx.port, names: ctx.names, cases: requestCases(ctx.basePath) });
    assert.deepEqual(mismatches, []);
    for (const s of [200, 301, 304, 400, 404, 405, 412]) assert.ok(statuses.has(s), `no case produced ${s}`);
  });

  test('runtime hardening as configured', () => {
    const id = docker(['compose', '-p', project, 'ps', '-q', CONTAINER_SERVICE], ctx.dir).stdout.trim();
    assert.ok(id);
    const fmt = '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.CapDrop}}|{{.HostConfig.SecurityOpt}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.Memory}}|{{json .NetworkSettings.Ports}}';
    const info = docker(['inspect', id, '--format', fmt], '/').stdout.trim();
    const [user, ro, capDrop, secOpt, pids, mem, ports] = info.split('|');
    assert.equal(user, '101:101');
    assert.equal(ro, 'true');
    assert.equal(capDrop, '[ALL]');
    assert.equal(secOpt, '[no-new-privileges:true]');
    assert.equal(pids, '64');
    assert.equal(mem, String(128 * 1024 * 1024));
    assert.deepEqual(JSON.parse(ports ?? 'null'), { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: String(ctx.port) }] });
    const internal = docker(['network', 'inspect', `${project}_${CONTAINER_NETWORK}`, '--format', '{{.Internal}}'], '/');
    assert.equal(internal.stdout.trim(), 'true');
    const egress = docker(['exec', id, 'wget', '-T', '3', '-q', '-O', '/dev/null', 'http://1.1.1.1/'], '/', 30_000);
    assert.equal(egress.ok, false, 'the web container must have no outbound connectivity');
  });
});
