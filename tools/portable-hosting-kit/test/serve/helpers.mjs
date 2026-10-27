// @ts-check
// Test helpers for the serving slice: fixture sites in temp dirs, a raw HTTP/1.1 client (sends request-targets
// verbatim), and an nginx runner bound to 127.0.0.1 on a free port.

import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const NGINX_BIN = process.env.HK_NGINX_BIN ?? '/usr/sbin/nginx';
export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GHOSTPAY_HEADERS_PATH = path.resolve(KIT_ROOT, '..', '..', 'apps', 'web', 'public', '_headers');

/** @returns {Promise<boolean>} */
export async function nginxAvailable() {
  try {
    await fs.access(NGINX_BIN, fs.constants.X_OK);
    return spawnSync(NGINX_BIN, ['-v'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/**
 * @param {string} prefix
 * @returns {Promise<string>}
 */
export async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `hk-serve-${prefix}-`));
}

/**
 * Write files ({ relPath: content }) below dir.
 * @param {string} dir
 * @param {Record<string, string | Uint8Array>} files
 */
export async function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
}

/** The fixture `_headers`: GhostPay's real rules plus rules exercising combination and detach. */
export async function fixtureHeadersText() {
  const ghostpay = await fs.readFile(GHOSTPAY_HEADERS_PATH, 'utf8');
  return `${ghostpay}
# --- fixture additions ---
/*.html
  X-Robots-Tag: noindex

/*.css
  X-Robots-Tag: noindex

/assets/*.css
  X-Robots-Tag: nosnippet

/.well-known/*
  ! X-Frame-Options
  Access-Control-Allow-Origin: *
  Cache-Control: max-age=60

/docs/*
  ! X-Robots-Tag
  X-Robots-Tag: all
  X-Doc: one
  X-Doc: two

/about/
  X-Dir-Rule: about
`;
}

const HTML = (/** @type {string} */ t) => `<!doctype html><html><head><title>${t}</title></head><body>${t}</body></html>\n`;

/**
 * Build the fixture site. Returns its directory and the file list (relative POSIX paths), including files that
 * must never be served (`_headers`, a hidden directory).
 * @returns {Promise<{ siteDir: string, files: string[] }>}
 */
export async function makeFixtureSite() {
  const siteDir = await tempDir('site');
  /** @type {Record<string, string | Uint8Array>} */
  const tree = {
    'index.html': HTML('home'),
    'about/index.html': HTML('about'),
    'docs/index.html': HTML('docs'),
    'docs/guide.html': HTML('guide'),
    'a.b/index.html': HTML('dotted dir'),
    'assets/app-1a2b.js': 'console.log("app");\n',
    'assets/style-3c4d.css': 'body{color:#111}\n',
    'assets/LOGO.PNG': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
    'assets/font.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]),
    'assets/data.wasm': new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]),
    'deployments/31337.json': '{"chainId":31337}\n',
    'ghostpay-embed-v1.js': 'export {};\n',
    'manifest.webmanifest': '{"name":"x"}\n',
    'LICENSE': 'MIT\n',
    'robots.txt': 'User-agent: *\n',
    '.well-known/security.txt': 'Contact: mailto:security@example.invalid\n',
    '.hidden/secret.txt': 'must never be served\n',
    'unicode/caf\u00e9.txt': 'cafe\n',
    'space dir/my file.txt': 'spaces\n',
    '_headers': await fixtureHeadersText(),
  };
  await writeTree(siteDir, tree);
  return { siteDir, files: Object.keys(tree).sort() };
}

/**
 * @typedef {object} RawResponse
 * @property {number} status    final status
 * @property {number[]} interim 1xx statuses received before it
 * @property {Map<string, string>} headers lower-case name -> value (repeated headers joined with ", ")
 * @property {Buffer} body
 */

/**
 * Send one raw HTTP request (bytes as given, latin1) and read the response until the server closes.
 * @param {{ host?: string, port: number }} at
 * @param {string} rawRequest
 * @returns {Promise<RawResponse>}
 */
export function rawRequest({ host = '127.0.0.1', port }, rawRequest) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    /** @type {Buffer[]} */
    const chunks = [];
    sock.setTimeout(5000, () => sock.destroy(new Error('timeout')));
    sock.on('data', (c) => chunks.push(c));
    sock.on('error', reject);
    sock.on('close', () => {
      let buf = Buffer.concat(chunks);
      /** @type {number[]} */
      const interim = [];
      for (;;) {
        const sep = buf.indexOf('\r\n\r\n');
        const code = Number(buf.subarray(0, 12).toString('latin1').split(' ')[1]);
        if (sep < 0 || code < 100 || code > 199) break;
        interim.push(code);
        buf = buf.subarray(sep + 4);
      }
      const sep = buf.indexOf('\r\n\r\n');
      if (sep < 0) return reject(new Error(`no response head: ${JSON.stringify(buf.toString('latin1'))}`));
      const [statusLine = '', ...lines] = buf.subarray(0, sep).toString('latin1').split('\r\n');
      const headers = new Map();
      for (const l of lines) {
        const i = l.indexOf(':');
        const k = l.slice(0, i).trim().toLowerCase();
        const v = l.slice(i + 1).trim();
        headers.set(k, headers.has(k) ? `${headers.get(k)}, ${v}` : v);
      }
      resolve({ status: Number(statusLine.split(' ')[1]), interim, headers, body: buf.subarray(sep + 4) });
    });
    // write, not end: Node's HTTP server drops a connection whose client half-closes before an async response.
    // Requests carry "Connection: close", so the server closes when done.
    sock.write(Buffer.from(rawRequest, 'latin1'));
  });
}

/**
 * @param {string} method
 * @param {string} target
 * @param {Record<string, string>} [extra]
 * @param {{ host?: boolean, version?: string }} [opts]
 * @returns {string}
 */
export function buildRequest(method, target, extra = {}, { host = true, version = 'HTTP/1.1' } = {}) {
  const lines = [`${method} ${target} ${version}`];
  if (host) lines.push('Host: localhost');
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
  lines.push('Connection: close', '', '');
  return lines.join('\r\n');
}

/** @returns {Promise<number>} a currently free loopback port */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (a && typeof a === 'object' ? resolve(a.port) : reject(new Error('no port'))));
    });
  });
}

/**
 * Write generated files below dir.
 * @param {string} dir
 * @param {Array<{ name: string, data: Uint8Array }>} files
 */
export async function writeOutFiles(dir, files) {
  for (const f of files) {
    const abs = path.join(dir, ...f.name.split('/'));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.data);
  }
}

/**
 * `nginx -t` on a generated config. Returns { ok, output }.
 * @param {string} confFile absolute
 * @param {string} prefixDir writable
 */
export function nginxTest(confFile, prefixDir) {
  const r = spawnSync(NGINX_BIN, ['-t', '-p', `${prefixDir}/`, '-e', 'stderr', '-c', confFile], { encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout}${r.stderr}` };
}

/**
 * Start nginx in the foreground on the given config; resolves once the port (or unix socket) accepts connections.
 * `wrap` prefixes the command (e.g. setpriv to drop privileges).
 * @param {{ confFile: string, prefixDir: string, port?: number, socketPath?: string, wrap?: string[] }} a
 * @returns {Promise<{ stop(): Promise<void>, stderr(): string }>}
 */
export async function startNginx({ confFile, prefixDir, port, socketPath, wrap = [] }) {
  const argv = [...wrap, NGINX_BIN, '-p', `${prefixDir}/`, '-e', 'stderr', '-c', confFile, '-g', 'daemon off; master_process on;'];
  const child = spawn(/** @type {string} */ (argv[0]), argv.slice(1), { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  let exited = false;
  const exit = new Promise((resolve) => child.on('exit', () => { exited = true; resolve(undefined); }));
  const stop = async () => {
    if (!exited) child.kill('SIGTERM');
    await exit;
  };
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(`nginx exited: ${err}`);
    const ok = await new Promise((resolve) => {
      const s = socketPath ? net.connect({ path: socketPath }, () => { s.destroy(); resolve(true); }) : net.connect({ host: '127.0.0.1', port: port ?? 0 }, () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
    });
    if (ok) return { stop, stderr: () => err };
    await new Promise((r) => setTimeout(r, 50));
  }
  await stop();
  throw new Error(`nginx did not start: ${err}`);
}
