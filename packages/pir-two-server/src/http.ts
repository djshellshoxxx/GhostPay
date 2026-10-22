import { createServer, type IncomingMessage, type Server } from 'node:http';
import { PirError } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import type { PirServer } from './server.js';

/** Options for {@link createPirHttpServer}. */
export interface PirHttpOptions {
  /** Bind host. Default `127.0.0.1` (loopback). Binding elsewhere is the operator's explicit choice. */
  readonly host?: string;
  /** Port; 0 = ephemeral. Default 0. */
  readonly port?: number;
}

/** A started HTTP server. */
export interface RunningPirHttp {
  readonly port: number;
  close(): Promise<void>;
}

const OCTET = { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } as const;
const JSON_H = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;

function readBody(req: IncomingMessage, max: number): Promise<Uint8Array | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max && !done) {
        done = true;
        resolve(undefined);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    req.on('error', () => {
      if (!done) resolve(undefined);
    });
  });
}

/**
 * Reference HTTP front end for a {@link PirServer} (spec section 6 wire): `GET /v1/manifest` and
 * `POST /v1/pir` (octet-stream bitvector in, `pageBytes` octets out). No access log is written.
 *
 * @security Success responses have fixed size per route. All errors return the same one-byte body so error
 * text cannot carry request data. Query body limited to the exact expected size. Loopback bind by default.
 * UNVERIFIED against real deployments: only tested on loopback.
 */
export async function createPirHttpServer(pir: PirServer, opts: PirHttpOptions = {}): Promise<RunningPirHttp> {
  assertTestnetChainId(pir.manifest.chainId);
  const manifestBody = JSON.stringify(pir.manifest);
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const fail = (status: number): void => {
      res.writeHead(status, OCTET);
      res.end(Buffer.from([0]));
    };
    if (req.method === 'GET' && url.pathname === '/v1/manifest') {
      const cid = url.searchParams.get('chainId');
      if (cid !== null && cid !== String(pir.manifest.chainId)) return fail(404);
      res.writeHead(200, JSON_H);
      res.end(manifestBody);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/pir') {
      void readBody(req, pir.queryLength).then((body) => {
        if (body?.length !== pir.queryLength) return fail(400);
        try {
          const ans = pir.answer(body);
          res.writeHead(200, OCTET);
          res.end(Buffer.from(ans));
        } catch {
          fail(400);
        }
      });
      return;
    }
    fail(404);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', () => {
      resolve();
    });
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new PirError('TRANSPORT', 'no listen address');
  return {
    port: addr.port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
