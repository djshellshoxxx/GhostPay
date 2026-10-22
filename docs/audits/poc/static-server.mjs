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
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    log.push({ url: req.url, referer: req.headers.referer ?? null, method: req.method });
    const f = path.join(dist, p);
    if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('nf'); }
    const h = { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' };
    for (const r of rules) if (match(p, r.pattern)) Object.assign(h, r.headers);
    res.writeHead(200, h); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, port: srv.address().port, log })));
}
