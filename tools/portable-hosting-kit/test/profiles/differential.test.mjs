// @ts-check
// Differential test: the preview server and a real nginx running the generated profile must return identical
// status codes and kit-controlled headers (plus ETag/Last-Modified, and identical bodies for 200s) for the same
// raw requests, at the site root and at a subpath. Skips only when the nginx binary is absent.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadHeaderPolicy, kitHeaderNames } from '../../src/serve/headers.mjs';
import { startPreview } from '../../src/serve/preview.mjs';
import { exportStatic } from '../../src/profiles/static-export.mjs';
import { generateNginx } from '../../src/profiles/nginx.mjs';
import { NGINX_BIN, buildRequest, freePort, makeFixtureSite, nginxAvailable, nginxTest, rawRequest, startNginx, tempDir, writeOutFiles } from '../serve/helpers.mjs';
import { compareServers, requestCases } from './compare.mjs';

/** @typedef {import('../../src/types.mjs').HostConfig} HostConfig */

const HAVE_NGINX = await nginxAvailable();
const SKIP = HAVE_NGINX ? false : `nginx binary not found at ${NGINX_BIN} (set HK_NGINX_BIN); the differential test needs a real nginx`;
const ONION = `http://${'a'.repeat(56)}.onion`;

/**
 * @param {HostConfig} hostConfig
 * @param {string} label
 */
function differential(hostConfig, label) {
  /** @type {{ previewPort: number, nginxPort: number, names: string[], closers: Array<() => Promise<void>> }} */
  const ctx = { previewPort: 0, nginxPort: 0, names: [], closers: [] };

  before(async () => {
    if (SKIP) return;
    const { siteDir, files } = await makeFixtureSite();
    const policy = await loadHeaderPolicy(files, (p) => fs.readFile(path.join(siteDir, p), 'utf8'));
    ctx.names = [...kitHeaderNames(policy, hostConfig), 'etag', 'last-modified'];
    const outDir = await tempDir('out');
    // When the tests run as root, nginx workers drop to "nobody"; mkdtemp's 0700 would hide the site from them.
    await fs.chmod(outDir, 0o755);
    const runDir = await tempDir('run');
    ctx.closers.push(() => fs.rm(siteDir, { recursive: true, force: true }), () => fs.rm(outDir, { recursive: true, force: true }), () => fs.rm(runDir, { recursive: true, force: true }));
    const { wwwRoot } = await exportStatic({ siteDir, files, entrypoint: 'index.html', hostConfig, policy, outDir });
    for (let attempt = 0; ; attempt++) {
      const port = await freePort();
      const hc = { ...hostConfig, listen: { kind: /** @type {const} */ ('tcp'), host: '127.0.0.1', port } };
      const confDir = path.join(outDir, `nginx-${attempt}`);
      await writeOutFiles(confDir, generateNginx({ files, entrypoint: 'index.html', hostConfig: hc, policy, wwwRoot }).files);
      const conf = path.join(confDir, 'nginx.conf');
      const t = nginxTest(conf, runDir);
      assert.ok(t.ok, `nginx -t failed: ${t.output}`);
      try {
        const n = await startNginx({ confFile: conf, prefixDir: runDir, port });
        ctx.closers.unshift(() => n.stop());
        ctx.nginxPort = port;
        break;
      } catch (e) {
        if (attempt >= 2) throw e; // port taken between freePort() and bind: retry with another
      }
    }
    const preview = await startPreview({ siteDir, files, entrypoint: 'index.html', basePath: hostConfig.basePath, policy, hostConfig });
    ctx.closers.unshift(() => preview.close());
    ctx.previewPort = preview.port;
  });

  after(async () => {
    for (const close of ctx.closers) await close();
  });

  test(`${label}: preview and nginx agree on status, kit headers, validators and bodies`, { skip: SKIP }, async () => {
    const cases = requestCases(hostConfig.basePath);
    const { mismatches, statuses } = await compareServers({ previewPort: ctx.previewPort, otherPort: ctx.nginxPort, names: ctx.names, cases });
    assert.deepEqual(mismatches, []);
    // The case list really exercises every outcome.
    for (const s of [200, 301, 304, 400, 404, 405, 412]) assert.ok(statuses.has(s), `no case produced ${s}`);
  });

  test(`${label}: spot checks against the normative semantics`, { skip: SKIP }, async () => {
    const B = hostConfig.basePath;
    const r = async (/** @type {string} */ m, /** @type {string} */ t) => rawRequest({ port: ctx.nginxPort }, buildRequest(m, t));
    const deep = await r('GET', `${B}users/42`);
    assert.equal(deep.status, 200);
    assert.equal(deep.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(deep.headers.get('cache-control'), 'no-cache');
    assert.match(deep.body.toString(), /home/);
    const asset = await r('GET', `${B}assets/app-1a2b.js`);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(asset.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal((await r('GET', `${B}assets/LOGO.PNG`)).headers.get('content-type'), 'image/png');
    const css = await r('GET', `${B}assets/style-3c4d.css`);
    assert.equal(css.headers.get('x-robots-tag'), 'noindex, nosnippet');
    const guide = await r('GET', `${B}docs/guide.html`);
    assert.equal(guide.headers.get('x-robots-tag'), 'all');
    assert.equal(guide.headers.get('x-doc'), 'one, two');
    const wk = await r('GET', `${B}.well-known/security.txt`);
    assert.equal(wk.status, 200);
    assert.equal(wk.headers.get('x-frame-options'), undefined);
    assert.equal(wk.headers.get('access-control-allow-origin'), '*');
    assert.equal(wk.headers.get('cache-control'), 'max-age=60');
    assert.equal((await r('GET', `${B}LICENSE`)).headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal((await r('GET', `${B}_headers`)).status, 404);
    assert.equal((await r('GET', `${B}.hidden/secret.txt`)).status, 404);
    const missing = await r('GET', `${B}assets/missing.js`);
    assert.equal(missing.status, 404);
    assert.ok(missing.headers.get('content-security-policy'));
    const about = await r('GET', `${B}about`);
    assert.equal(about.status, 301);
    assert.equal(about.headers.get('location'), `${B}about/`);
    assert.equal(about.headers.get('x-dir-rule'), undefined, '"/about/" rule must not apply to the "/about" redirect');
    assert.ok(about.headers.get('content-security-policy'));
    const post = await r('POST', `${B}index.html`);
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    assert.ok(post.headers.get('content-security-policy'));
    if (B !== '/') {
      const bare = await r('GET', B.slice(0, -1));
      assert.equal(bare.status, 301);
      assert.equal(bare.headers.get('location'), B);
      assert.equal((await r('GET', '/index.html')).status, 404);
    }
    const hsts = hostConfig.transport === 'clearnet' && hostConfig.publicOrigin?.startsWith('https://');
    assert.equal(asset.headers.has('strict-transport-security'), Boolean(hsts));
    assert.equal(asset.headers.get('onion-location'), hostConfig.onionLocation ? `${hostConfig.onionLocation}${B}assets/app-1a2b.js` : undefined);
  });
}

/** @type {HostConfig} */
const ROOT = {
  schemaVersion: 1, transport: 'clearnet', publicOrigin: 'https://mirror.example.org', basePath: '/',
  listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'root', onionLocation: ONION,
};
/** @type {HostConfig} */
const SUB = {
  schemaVersion: 1, transport: 'onion', publicOrigin: null, basePath: '/mirror/app/',
  listen: { kind: 'tcp', host: '127.0.0.1', port: 8080 }, mirrorLabel: 'sub', onionLocation: null,
};

describe('root base path, clearnet https + Onion-Location', () => differential(ROOT, 'root'));
describe('subpath /mirror/app/, onion', () => differential(SUB, 'subpath'));
