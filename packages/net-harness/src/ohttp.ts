import http from 'node:http';
import { listenLoopback, trackSockets, assertLoopback, type Running } from './loopback.js';

/** Media types of RFC 9458 (UNVERIFIED: recalled, not re-read this run). */
export const OHTTP_REQ_TYPE = 'message/ohttp-req';
/** Response media type. */
export const OHTTP_RES_TYPE = 'message/ohttp-res';
/** Key configuration media type. */
export const OHTTP_KEYS_TYPE = 'application/ohttp-keys';

/** Options for {@link startOhttpGateway}. */
export interface OhttpGatewayOptions {
  /** Loopback bind host. Default `127.0.0.1`. */
  readonly host?: string;
  /** Bytes served at `GET /ohttp-keys`. */
  readonly keyConfig: Uint8Array;
  /**
   * Handles one encapsulated request and returns the encapsulated response. Injected: the stub holds
   * NO key material and does no cryptography. Throw to make the gateway answer 400.
   */
  readonly handle: (encapsulatedRequest: Uint8Array) => Promise<Uint8Array>;
}

/** A recorded gateway or relay exchange. */
export interface OhttpRecord {
  /** Request path. */
  readonly path: string;
  /** Content-type header. */
  readonly contentType: string | undefined;
  /** Body bytes seen. */
  readonly body: Buffer;
  /** Socket peer address. */
  readonly remoteAddress: string | undefined;
  /** Lower-cased header map. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/** Running OHTTP gateway stub. */
export interface OhttpGateway extends Running {
  /** Requests seen by the gateway (it sees the relay's address, never the client's). */
  readonly records: readonly OhttpRecord[];
  /** Base URL. */
  readonly baseUrl: string;
}

/** Running OHTTP relay stub. */
export interface OhttpRelay extends Running {
  /** Requests seen by the relay (it sees the client's address and only ciphertext). */
  readonly records: readonly OhttpRecord[];
  /** Relay endpoint URL clients POST to. */
  readonly relayUrl: string;
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function record(req: http.IncomingMessage, body: Buffer): OhttpRecord {
  return {
    path: req.url as string,
    contentType: req.headers['content-type'],
    body,
    remoteAddress: req.socket.remoteAddress,
    headers: { ...req.headers },
  };
}

/**
 * Starts an OHTTP gateway STUB: `GET /ohttp-keys` and `POST /ohttp-gateway`. It does no cryptography
 * and is NOT a conformant RFC 9458 gateway; it only checks media types and delegates to `handle`.
 *
 * @security test-only; loopback only.
 * @param opts Options.
 */
export async function startOhttpGateway(opts: OhttpGatewayOptions): Promise<OhttpGateway> {
  const host = opts.host ?? '127.0.0.1';
  assertLoopback(host, 'gateway bind host');
  const records: OhttpRecord[] = [];
  const server = http.createServer((req, res) => {
    void (async () => {
      const body = await readBody(req);
      records.push(record(req, body));
      if (req.method === 'GET' && req.url === '/ohttp-keys') {
        res.writeHead(200, { 'content-type': OHTTP_KEYS_TYPE });
        res.end(Buffer.from(opts.keyConfig));
        return;
      }
      if (req.method !== 'POST' || req.url !== '/ohttp-gateway') {
        res.writeHead(404).end();
        return;
      }
      if (req.headers['content-type'] !== OHTTP_REQ_TYPE) {
        res.writeHead(415).end();
        return;
      }
      try {
        const out = await opts.handle(new Uint8Array(body));
        res.writeHead(200, { 'content-type': OHTTP_RES_TYPE });
        res.end(Buffer.from(out));
      } catch {
        res.writeHead(400).end();
      }
    })();
  });
  const sockets = trackSockets(server);
  const running = await listenLoopback(server, host, sockets);
  return Object.assign(running, { records, baseUrl: `http://${host}:${String(running.port)}` });
}

/**
 * Starts an OHTTP relay STUB: `POST /relay` forwards the opaque body to `gatewayUrl` and returns the
 * answer. It records what a real relay could see (client address, ciphertext) so tests can assert the
 * relay never sees plaintext and the gateway never sees the client address.
 *
 * @security test-only; loopback only; the gateway URL must be loopback.
 * @param o Options.
 */
export async function startOhttpRelay(o: { host?: string; gatewayUrl: string }): Promise<OhttpRelay> {
  const host = o.host ?? '127.0.0.1';
  assertLoopback(host, 'relay bind host');
  const target = new URL(o.gatewayUrl);
  assertLoopback(target.hostname, 'gateway host');
  const records: OhttpRecord[] = [];
  const server = http.createServer((req, res) => {
    void (async () => {
      const body = await readBody(req);
      records.push(record(req, body));
      if (req.method !== 'POST' || req.url !== '/relay') {
        res.writeHead(404).end();
        return;
      }
      if (req.headers['content-type'] !== OHTTP_REQ_TYPE) {
        res.writeHead(415).end();
        return;
      }
      const fwd = http.request(
        { host: target.hostname, port: target.port, path: '/ohttp-gateway', method: 'POST', headers: { 'content-type': OHTTP_REQ_TYPE } },
        (up) => {
          res.writeHead(up.statusCode ?? 502, { 'content-type': up.headers['content-type'] ?? 'text/plain' });
          up.pipe(res);
        },
      );
      fwd.on('error', () => {
        res.writeHead(502).end();
      });
      fwd.end(body);
    })();
  });
  const sockets = trackSockets(server);
  const running = await listenLoopback(server, host, sockets);
  return Object.assign(running, { records, relayUrl: `http://${host}:${String(running.port)}/relay` });
}
