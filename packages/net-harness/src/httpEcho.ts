import http from 'node:http';
import https from 'node:https';
import { listenLoopback, trackSockets, type Running } from './loopback.js';
import { TEST_TLS_CERT, TEST_TLS_KEY } from './tlsFixture.js';

/** One request recorded by an echo server. */
export interface HttpRecord {
  /** HTTP method. */
  readonly method: string;
  /** Request target (path + query). */
  readonly url: string;
  /** Lower-cased header map. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Raw request body. */
  readonly body: Buffer;
  /** Remote (client) address as the server saw it; with a proxy this is the proxy's address. */
  readonly remoteAddress: string | undefined;
}

/** Options for {@link startHttpEcho}. */
export interface HttpEchoOptions {
  /** Loopback bind host. Default `127.0.0.1`. */
  readonly host?: string;
  /** Serve TLS with the harness's test-only certificate. */
  readonly tls?: boolean;
  /** Fixed status to answer with. Default 200. */
  readonly status?: number;
  /** Fixed response body (bytes or text) instead of echoing the request body. */
  readonly responseBody?: string | Buffer;
  /** Extra response headers (e.g. `location` for redirect tests). */
  readonly responseHeaders?: Readonly<Record<string, string>>;
  /** Delay before answering, ms. */
  readonly delayMs?: number;
  /** Never answer (timeout tests). */
  readonly hang?: boolean;
  /** Answer with this many bytes of `x` (size-cap tests). Overrides `responseBody`. */
  readonly bigBody?: number;
}

/** A running echo server. */
export interface HttpEcho extends Running {
  /** Every request received. */
  readonly records: readonly HttpRecord[];
  /** `http(s)://host:port` base without trailing slash. */
  readonly baseUrl: string;
  /** PEM of the test CA to trust for `tls: true` servers. */
  readonly ca: string;
}

/**
 * Starts a loopback HTTP(S) server that records requests and echoes the body (or serves a fixed one).
 *
 * @security test-only. The TLS certificate is a public test fixture.
 * @param opts Options.
 */
export async function startHttpEcho(opts: HttpEchoOptions = {}): Promise<HttpEcho> {
  const host = opts.host ?? '127.0.0.1';
  const records: HttpRecord[] = [];
  const handler: http.RequestListener = (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      records.push({
        method: req.method as string,
        url: req.url as string,
        headers: { ...req.headers },
        body,
        remoteAddress: req.socket.remoteAddress,
      });
      if (opts.hang === true) return;
      const send = (): void => {
        const out =
          opts.bigBody !== undefined ? Buffer.alloc(opts.bigBody, 0x78) : (opts.responseBody ?? body);
        res.writeHead(opts.status ?? 200, { 'content-type': 'application/json', ...(opts.responseHeaders ?? {}) });
        res.end(out);
      };
      if (opts.delayMs !== undefined) setTimeout(send, opts.delayMs);
      else send();
    });
  };
  const server =
    opts.tls === true
      ? https.createServer({ cert: TEST_TLS_CERT, key: TEST_TLS_KEY }, handler)
      : http.createServer(handler);
  const sockets = trackSockets(server);
  const running = await listenLoopback(server, host, sockets);
  return Object.assign(running, {
    records,
    baseUrl: `${opts.tls === true ? 'https' : 'http'}://${host}:${String(running.port)}`,
    ca: TEST_TLS_CERT,
  });
}
