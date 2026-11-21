import { createServer, request } from 'node:http';

export const REDIRECT_HEADER = 'x-ghostpay-e2e-redirect';

/**
 * A loopback-only proxy for the already-built test application. Browser interception marks only the
 * startup hash read; the HTTP server emits the real redirect. WebKit cannot fulfill a route with 3xx.
 * All ordinary document/assets are forwarded to the existing local preview without changing bytes.
 * This helper is imported only by E2E tests and never by the application or a production server.
 */
export async function startHttpRedirectFixture(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin);
  if (upstream.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname)
    || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('The E2E redirect fixture requires a loopback HTTP origin.');
  }
  let redirect;
  const responses = [];
  const pending = new Set();
  const server = createServer((incoming, outgoing) => {
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      outgoing.writeHead(405).end();
      return;
    }
    if (incoming.headers[REDIRECT_HEADER] === '1' && redirect !== undefined) {
      responses.push({ status: redirect.status, location: redirect.location, path: incoming.url });
      outgoing.writeHead(redirect.status, { location: redirect.location, 'cache-control': 'no-store' }).end();
      return;
    }
    const headers = { ...incoming.headers, host: upstream.host };
    delete headers[REDIRECT_HEADER];
    const forwarded = request({ hostname: upstream.hostname.replace(/^\[|\]$/g, ''), port: upstream.port,
      method: incoming.method, path: incoming.url, headers }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    pending.add(forwarded);
    forwarded.once('close', () => pending.delete(forwarded));
    forwarded.once('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.once('close', () => { if (!outgoing.writableFinished) forwarded.destroy(); });
    forwarded.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing loopback fixture address.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    responses,
    setRedirect(status, location) {
      if (![302, 307].includes(status) || typeof location !== 'string' || /[\r\n]/.test(location)) {
        throw new Error('Invalid authored redirect fixture.');
      }
      redirect = { status, location };
    },
    async close() {
      for (const forwarded of pending) forwarded.destroy();
      const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}
