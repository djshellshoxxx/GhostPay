// Tiny static server for the built bundle. Mode "headers" applies apps/web/public/_headers (Cloudflare/Netlify-like);
// mode "meta" serves files with NO extra headers (GitHub-Pages-like) so only the <meta> CSP / referrer apply.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function startServer(dist, mode = 'headers', port = 0) {
  const rules = [];
  if (mode === 'headers') {
    let cur = null;
    for (const line of fs.readFileSync(path.join(dist, '_headers'), 'utf8').split('\n')) {
      if (line.startsWith('#') || line.trim() === '') continue;
      if (!line.startsWith(' ')) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); }
      else { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    }
  }
  const match = (p, pat) => pat === '/*' || (pat.endsWith('/*') ? p.startsWith(pat.slice(0, -1)) : p === pat);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };
  const log = [];
  const root = fs.realpathSync(path.resolve(dist));
  const inside = (file) => {
    const rel = path.relative(root, file);
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  };
  const srv = http.createServer((req, res) => {
    // Only the path is used; the base is a parse-only placeholder and is never contacted.
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad path'); }
    if (p.endsWith('/')) p += 'index.html';
    log.push({ url: req.url, referer: req.headers.referer ?? null, method: req.method });
    const f = path.resolve(root, `.${p}`);
    // Containment by path components, not string prefix: "/srv/dist-secret" starts with "/srv/dist" but is outside it.
    if (!inside(f)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nf'); }
    let contents;
    try {
      // A lexically contained symlink can still target a file outside the served bundle.
      const resolved = fs.realpathSync(f);
      if (!inside(resolved) || !fs.statSync(resolved).isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nf'); }
      // Read before writing success headers: disappeared or unreadable files must not crash the server or look OK.
      contents = fs.readFileSync(resolved);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nf'); }
    const h = { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' };
    for (const r of rules) if (match(p, r.pattern)) Object.assign(h, r.headers);
    res.writeHead(200, h); res.end(contents);
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, port: srv.address().port, log })));
}
