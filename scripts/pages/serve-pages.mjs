#!/usr/bin/env node
// Local stand-in for GitHub Pages (project page), for testing a built site exactly where Pages would serve it.
//
// What it mimics: a project page lives under /<repo>/ (default /GhostPay/), `<base>` and every `<dir>/` serve that
// directory's index.html, `<base>` without its trailing slash and `<dir>` without one are 301-redirected to the slash
// form, the Content-Type comes only from the file extension, a query string is ignored, and anything that is not a
// published file answers 404 (the site's own 404.html when it has one, like Pages). Like Pages it sends NO security
// headers at all (no CSP, X-Frame-Options, nosniff, COOP/COEP, Referrer-Policy, Permissions-Policy, HSTS): the site
// must stand on its meta CSP alone, which is exactly what the browser test then exercises.
//
// Hardening (this serves a test artifact, never production): binds 127.0.0.1 only; GET and HEAD only; the decoded,
// normalized path must stay inside the site directory; NUL bytes, backslashes, malformed escapes and dot segments
// are refused; every path component is lstat-ed and a symlink anywhere refuses the request; only regular files with an
// allowlisted extension are served. No dependencies.
//
// Usage: node scripts/pages/serve-pages.mjs <siteDir> --port N [--base /GhostPay/]
import { createServer } from 'node:http';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Content-Type by extension; every other extension is a 404 (the verifier allowlists the same set). */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
});

/** Normalizes a base path to `/segment/.../` form. Throws on anything else. */
export function normalizeBase(raw = '/GhostPay/') {
  let base = String(raw);
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  if (base !== '/' && !/^\/(?:[A-Za-z0-9._-]+\/)+$/.test(base)) throw new Error(`invalid base path: ${String(raw)}`);
  if (base.split('/').some((s) => s === '.' || s === '..')) throw new Error(`invalid base path: ${String(raw)}`);
  return base;
}

function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Maps a request target to a decision, without touching the response. `siteRoot` must be a real (symlink-free)
 * absolute directory path. Returns one of:
 *   { status: 200, file, type }       serve this regular file
 *   { status: 301, location }         redirect to the slash form
 *   { status: 404 } / { status: 400 } refuse
 */
export function resolveRequest(siteRoot, base, target) {
  let pathname;
  try {
    // Only the path matters; a query string or fragment never selects another file (Pages ignores it).
    pathname = new URL(target, 'http://pages.invalid').pathname;
  } catch {
    return { status: 400 };
  }
  if (base !== '/' && pathname === base.slice(0, -1)) return { status: 301, location: base };
  if (!pathname.startsWith(base)) return { status: 404 };
  const rawRel = pathname.slice(base.length);
  let rel;
  try {
    rel = decodeURIComponent(rawRel);
  } catch {
    return { status: 400 };
  }
  if (rel.includes('\0') || rel.includes('\\')) return { status: 400 };
  const segments = rel.split('/');
  // Dot segments are already folded by URL parsing when literal; encoded ones (%2e%2e) surface here and are refused.
  if (segments.some((s) => s === '.' || s === '..')) return { status: 404 };
  if (segments.slice(0, -1).some((s) => s === '')) return { status: 404 };
  const wantsIndex = rel === '' || rel.endsWith('/');
  const relFile = wantsIndex ? `${rel}index.html` : rel;
  const file = resolve(siteRoot, ...relFile.split('/'));
  if (file !== siteRoot && !file.startsWith(siteRoot + sep)) return { status: 404 };
  // lstat every component below the root: a symlink anywhere (directory or file) is refused, never followed.
  const parts = file.slice(siteRoot.length + 1).split(sep);
  let cur = siteRoot;
  for (let i = 0; i < parts.length; i += 1) {
    cur = join(cur, parts[i]);
    let st;
    try {
      st = lstatSync(cur);
    } catch {
      return { status: 404 };
    }
    if (st.isSymbolicLink()) return { status: 404 };
    const last = i === parts.length - 1;
    if (!last && !st.isDirectory()) return { status: 404 };
    if (last && st.isDirectory()) {
      // `<dir>` without its slash: Pages redirects to `<dir>/`.
      return wantsIndex ? { status: 404 } : { status: 301, location: `${pathname}/` };
    }
    if (last && !st.isFile()) return { status: 404 };
  }
  const type = MIME_TYPES[extOf(parts[parts.length - 1] ?? '')];
  if (type === undefined) return { status: 404 };
  return { status: 200, file, type };
}

/** Creates (does not start) the server for `siteDir` under `base`. */
export function createPagesServer({ siteDir, base = '/GhostPay/', log = () => undefined } = {}) {
  if (typeof siteDir !== 'string' || siteDir === '') throw new Error('siteDir is required');
  const root = realpathSync(resolve(siteDir));
  if (!lstatSync(root).isDirectory()) throw new Error(`not a directory: ${siteDir}`);
  const prefix = normalizeBase(base);
  const notFound = (() => {
    const d = resolveRequest(root, prefix, `${prefix}404.html`);
    return d.status === 200 ? d.file : undefined;
  })();

  return createServer((req, res) => {
    const method = req.method ?? 'GET';
    const target = req.url ?? '/';
    const send = (status, headers, body) => {
      res.writeHead(status, { ...headers, 'content-length': String(body.length) });
      res.end(method === 'HEAD' ? undefined : body);
      log(`${method} ${target} -> ${String(status)}`);
    };
    if (method !== 'GET' && method !== 'HEAD') {
      send(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' }, Buffer.from('Method Not Allowed\n'));
      return;
    }
    const d = resolveRequest(root, prefix, target);
    if (d.status === 200) {
      let body;
      try {
        body = readFileSync(d.file);
      } catch {
        send(404, { 'content-type': 'text/plain; charset=utf-8' }, Buffer.from('Not Found\n'));
        return;
      }
      // Pages' own caching header; deliberately nothing security related.
      send(200, { 'content-type': d.type, 'cache-control': 'max-age=600' }, body);
      return;
    }
    if (d.status === 301) {
      send(301, { location: d.location, 'content-type': 'text/plain; charset=utf-8' }, Buffer.from('Moved Permanently\n'));
      return;
    }
    if (d.status === 404 && notFound !== undefined && target.startsWith(prefix)) {
      send(404, { 'content-type': MIME_TYPES['.html'] }, readFileSync(notFound));
      return;
    }
    send(d.status, { 'content-type': 'text/plain; charset=utf-8' }, Buffer.from(d.status === 400 ? 'Bad Request\n' : 'Not Found\n'));
  });
}

function parseArgs(argv) {
  const out = { siteDir: undefined, port: undefined, base: '/GhostPay/' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--base') out.base = argv[++i];
    else if (a !== undefined && !a.startsWith('--') && out.siteDir === undefined) out.siteDir = a;
    else throw new Error(`unexpected argument: ${String(a)}`);
  }
  if (out.siteDir === undefined || !Number.isSafeInteger(out.port) || out.port < 1 || out.port > 65535) {
    throw new Error('usage: serve-pages.mjs <siteDir> --port N [--base /GhostPay/]');
  }
  return out;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`serve-pages: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  const server = createPagesServer({ siteDir: args.siteDir, base: args.base, log: process.env['SERVE_PAGES_LOG'] === '1' ? (l) => console.log(l) : undefined });
  server.on('error', (e) => {
    console.error(`serve-pages: ${e.message}`);
    process.exit(1);
  });
  // Loopback only: this is a test server for a local artifact.
  server.listen(args.port, '127.0.0.1', () => {
    console.log(`serve-pages: ${resolve(args.siteDir)} at http://127.0.0.1:${String(args.port)}${normalizeBase(args.base)} (no security headers, like GitHub Pages)`);
  });
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
