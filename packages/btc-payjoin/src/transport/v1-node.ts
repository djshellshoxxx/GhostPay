import { createServer } from 'node:http';
import { PayjoinError } from '../errors.js';
import type { HttpHandler, HttpListener } from './v1-http.js';

const MAX_BODY = 256 * 1024;

/**
 * Node `http` listener for the v1 receiver endpoint. Binds to loopback by
 * default; exposing it needs a TLS terminator or an onion service in front
 * (BIP-78: the sender must see authenticated encryption).
 *
 * @security Body size capped; only the handler's status, headers and body are
 * written; handler exceptions become a bare 503.
 */
export async function nodeListen(handler: HttpHandler, host = '127.0.0.1', port = 0, path = '/pj'): Promise<HttpListener> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const u = new URL(req.url ?? '/', 'http://localhost');
      if (u.pathname !== path) {
        res.writeHead(404).end();
        return;
      }
      handler({ method: req.method ?? 'GET', query: u.search.slice(1), body: Buffer.concat(chunks).toString('utf8') }).then(
        (r) => {
          res.writeHead(r.status, r.headers).end(r.body);
        },
        () => {
          res.writeHead(503).end();
        },
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new PayjoinError('transport_failed');
  return {
    url: `http://${host === '::1' ? '[::1]' : host}:${String(addr.port)}${path}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
