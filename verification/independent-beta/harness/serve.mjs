// W5 independent payment-state verifier: loopback-only static server for the built candidate (apps/web/dist).
// Binds 127.0.0.1 only. Serves files read-only; no directory listing; path traversal is rejected.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Start the server; resolves to { origin, close }. */
export async function serveDist(root, { port = 4173, host = '127.0.0.1' } = {}) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = resolve(base, `.${normalize(rel)}`);
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end();
        return;
      }
      const info = await stat(file).catch(() => null);
      // A missing asset (a path with a file extension) is a 404, so the app's own asset errors stay visible; only
      // extension-less paths fall back to the single-page index. The harness's build record is never served.
      // (audit finding 19)
      if (rel.endsWith('/.w5-build.json') || (!info?.isFile() && extname(rel) !== '')) {
        res.writeHead(404).end();
        return;
      }
      const target = info?.isFile() ? file : join(base, 'index.html');
      const body = await readFile(target);
      res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, ok);
  });
  server.on('error', () => undefined); // a later socket error must not crash the run (audit finding 19)
  const addr = server.address();
  return {
    // `localhost` keeps the origin identical to the repository's own E2E origin (http://localhost:4173).
    origin: `http://localhost:${addr.port}`,
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}
