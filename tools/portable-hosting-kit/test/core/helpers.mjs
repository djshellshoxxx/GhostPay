// @ts-check
// Shared test helpers for the core: temp directories, fixture trees, filesystem snapshots, fault injection.
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** @typedef {import('../../src/types.mjs').Limits} Limits */

/** Small limits so bound tests stay fast. */
export const SMALL_LIMITS = Object.freeze({
  maxFiles: 50,
  maxTotalBytes: 64 * 1024,
  maxFileBytes: 16 * 1024,
  maxPathBytes: 120,
  maxSegmentBytes: 60,
  maxDepth: 6,
  maxDirEntries: 200,
});

/** A 1x1 PNG. */
export const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');

/**
 * A small, valid site. Text deliberately compressible so deflate is chosen for some entries.
 * @returns {Record<string, string | Uint8Array>}
 */
export function goodSite() {
  return {
    'index.html': `<!doctype html><html><head><title>t</title><link rel="stylesheet" href="assets/style.css"></head><body>${'<p>hello</p>'.repeat(40)}<script type="module" src="assets/app.js"></script></body></html>\n`,
    'assets/app.js': `export const greeting = 'hello';\n${'console.log(greeting);\n'.repeat(30)}`,
    'assets/style.css': 'body { margin: 0; }\n',
    'img/logo.png': PNG_BYTES,
    _headers: "/*\n  X-Content-Type-Options: nosniff\n",
    LICENSE: 'MIT\n',
    '.well-known/security.txt': 'Contact: mailto:security@example.invalid\n',
    'deployments/8453.json': '{"chainId":8453}\n',
    'locales/caf\u00e9.json': '{"hello":"bonjour"}\n',
  };
}

/**
 * Temporary directory removed after the test.
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix]
 * @returns {Promise<string>}
 */
export async function tmpDir(t, prefix = 'hk-core-') {
  const d = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fsp.rm(d, { recursive: true, force: true }));
  return d;
}

/**
 * Write files (creating parent directories) in the given order.
 * @param {string} root
 * @param {Record<string, string | Uint8Array>} files
 * @param {string[]} [order]
 */
export async function writeTree(root, files, order = Object.keys(files)) {
  for (const rel of order) {
    const abs = path.join(root, ...rel.split('/'));
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, /** @type {string | Uint8Array} */ (files[rel]));
  }
}

/**
 * Recursive snapshot (lstat only) of names, types, sizes, modes, mtimes and content hashes.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function snapshot(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir @param {string} rel */
  async function walk(dir, rel) {
    for (const name of (await fsp.readdir(dir)).sort()) {
      const abs = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = await fsp.lstat(abs);
      let extra = '';
      if (st.isFile()) extra = createHash('sha256').update(await fsp.readFile(abs)).digest('hex');
      if (st.isSymbolicLink()) extra = await fsp.readlink(abs);
      out.push(`${r}|${st.mode}|${st.size}|${st.mtimeMs}|${extra}`);
      if (st.isDirectory()) await walk(abs, r);
    }
  }
  await walk(root, '');
  return out;
}

/**
 * A node:fs/promises stand-in that counts every call (including FileHandle methods) and throws on call `failAt`.
 * Every op still runs for real except the failing one; a failing `close` closes first, then throws.
 * @param {number} [failAt]
 * @returns {{ fs: typeof import('node:fs/promises'), calls: string[], failed: () => string | null }}
 */
export function faultyFs(failAt = Infinity) {
  /** @type {string[]} */
  const calls = [];
  /** @type {string | null} */
  let failedOp = null;
  /** @param {string} op */
  const tick = (op) => {
    calls.push(op);
    if (calls.length === failAt) {
      failedOp = op;
      throw Object.assign(new Error(`injected failure in ${op}`), { code: 'EINJECT' });
    }
  };
  /** @param {any} fh */
  const wrapHandle = (fh) => new Proxy(fh, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      if (prop === 'close') {
        return async (/** @type {any[]} */ ...a) => {
          await v.apply(target, a);
          tick('fh.close');
        };
      }
      return async (/** @type {any[]} */ ...a) => {
        tick(`fh.${String(prop)}`);
        return v.apply(target, a);
      };
    },
  });
  const fs = new Proxy(fsp, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      return async (/** @type {any[]} */ ...a) => {
        tick(String(prop));
        const r = await v.apply(target, a);
        return prop === 'open' ? wrapHandle(r) : r;
      };
    },
  });
  return { fs, calls, failed: () => failedOp };
}

/**
 * @param {Promise<unknown>} p
 * @param {string} code
 * @param {RegExp} [message]
 */
export async function rejectsCode(p, code, message) {
  await assert.rejects(p, (/** @type {any} */ e) => {
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    if (message) assert.match(e.message, message);
    return true;
  });
}

/**
 * @param {() => unknown} fn
 * @param {string} code
 * @param {RegExp} [message]
 */
export function throwsCode(fn, code, message) {
  try {
    fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err.code !== code) throw new Error(`expected ${code}, got ${err.code}: ${err.message}`, { cause: e });
    if (message && !message.test(err.message)) throw new Error(`message ${JSON.stringify(err.message)} does not match ${message}`, { cause: e });
    return;
  }
  throw new Error(`expected a ${code} error, nothing was thrown`);
}

/**
 * Entries of a self-consistent archive (manifest + SHA256SUMS match the content) as an attacker without any key
 * could produce: everything verifies unless the caller pins an expected digest.
 * @param {{ appId?: string, label?: string, site: Record<string, string>, meta?: Record<string, string> }} spec
 * @returns {Promise<{ name: string, data: Buffer }[]>}
 */
export async function forgeEntries({ appId = 'ghostpay-web', label = 'v1', site, meta = {} }) {
  const { buildManifest, serializeManifest } = await import('../../src/core/manifest.mjs');
  const { formatSums } = await import('../../src/core/verify.mjs');
  const { DEFAULT_LIMITS } = await import('../../src/policy.mjs');
  const sha = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex');
  const records = Object.entries(site).map(([p, d]) => ({ path: p, size: Buffer.byteLength(d), sha256: sha(Buffer.from(d)) }));
  const manifest = buildManifest({
    appId, entrypoint: 'index.html', records, limits: DEFAULT_LIMITS, allowSourceMaps: false,
    provenance: { label, sourceDateEpoch: null, source: { kind: 'directory' }, notes: [] }, trustSensitive: [], metadataFiles: ['HOSTING-MANIFEST.json', ...Object.keys(meta)],
  });
  const top = `${appId}-${label}`;
  /** @type {Map<string, string>} */
  const hashes = new Map();
  /** @type {{ name: string, data: Buffer }[]} */
  const entries = [];
  const add = (/** @type {string} */ rel, /** @type {Buffer} */ data) => {
    if (rel !== 'SHA256SUMS') hashes.set(rel, sha(data));
    entries.push({ name: `${top}/${rel}`, data });
  };
  for (const [p, d] of Object.entries(site)) add(`site/${p}`, Buffer.from(d));
  add('HOSTING-MANIFEST.json', Buffer.from(serializeManifest(manifest)));
  for (const [p, d] of Object.entries(meta)) add(p, Buffer.from(d));
  add('SHA256SUMS', Buffer.from(formatSums(hashes)));
  return entries;
}
