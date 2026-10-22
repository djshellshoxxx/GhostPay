import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { ChainAdapterError, RpcHttpError } from '@ghostpay/chain-adapters';
import type { Target } from './url.js';

/** Per-call limits from the `RpcTransport` contract. */
export interface RequestLimits {
  /** Overall deadline, ms (connect + handshake + request + response). */
  readonly timeoutMs: number;
  /** Maximum response body bytes. */
  readonly maxBytes: number;
}

/** Opens a connected tunnel socket to `host:port` within `timeoutMs`. */
export type OpenTunnel = (host: string, port: number, timeoutMs: number) => Promise<net.Socket>;

/** Extra TLS options (tests inject a CA; production passes none and uses the system store). */
export interface TlsExtras {
  /** Extra CA certificates. TEST ONLY. */
  readonly ca?: string | Buffer | undefined;
}

/**
 * POSTs `body` to `target` over a tunnel created by `open`, honouring the `RpcTransport` contract:
 * overall `timeoutMs`; `maxBytes` cap (`RESPONSE_TOO_LARGE`); non-2xx -> {@link RpcHttpError}; a 3xx is
 * a failure (never followed); TLS is verified against `servername = host` for https.
 *
 * @remarks Built on `http.request({createConnection})` with NO agent (Node ignores `createConnection` when an agent
 * is set, and would then call `dns.lookup`), so Node's global `fetch` is not used and
 * `dns.lookup` is never reached: the socket is supplied by `open`.
 * @param target Parsed destination.
 * @param body JSON text.
 * @param limits Timeout and size cap.
 * @param open Tunnel factory (SOCKS5h or HTTP CONNECT).
 * @param extras TLS extras.
 * @returns The response body as text.
 */
export function postOverTunnel(
  target: Target,
  body: string,
  limits: RequestLimits,
  open: OpenTunnel,
  extras: TlsExtras = {},
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let sock: net.Socket | undefined;
    let req: http.ClientRequest | undefined;
    const done = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      done(() => {
        sock?.destroy();
        req?.destroy();
        reject(new ChainAdapterError('RPC_FAILURE', 'transport timeout'));
      });
    }, limits.timeoutMs);
    const failTransport = (): void => {
      done(() => {
        sock?.destroy();
        reject(new ChainAdapterError('RPC_FAILURE', 'transport error'));
      });
    };

    open(target.host, target.port, limits.timeoutMs)
      .then((tunnel) => {
        sock = tunnel;
        if (settled) {
          tunnel.destroy();
          return;
        }
        let conn: net.Socket = tunnel;
        if (target.tls) {
          const bare = target.host.startsWith('[') ? target.host.slice(1, -1) : target.host;
          conn = tls.connect({
            socket: tunnel,
            ...(net.isIP(bare) === 0 ? { servername: bare } : {}),
            ...(extras.ca !== undefined ? { ca: extras.ca } : {}),
            minVersion: 'TLSv1.2',
          });
          conn.on('error', failTransport);
          sock = conn;
        }
        tunnel.resume();
        const payload = Buffer.from(body, 'utf8');
        req = http.request({
          createConnection: () => conn,
          method: 'POST',
          host: target.host,
          port: target.port,
          path: target.path,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'content-length': String(payload.length),
            connection: 'close',
          },
        });
        req.on('error', failTransport);
        req.on('response', (res) => {
          const status = res.statusCode as number;
          if (status < 200 || status > 299) {
            res.destroy();
            done(() => {
              conn.destroy();
              reject(new RpcHttpError(status));
            });
            return;
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > limits.maxBytes) {
            res.destroy();
            done(() => {
              conn.destroy();
              reject(new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap'));
            });
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (c: Buffer) => {
            total += c.length;
            if (total > limits.maxBytes) {
              res.destroy();
              done(() => {
                conn.destroy();
                reject(new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap'));
              });
              return;
            }
            chunks.push(c);
          });
          let ended = false;
          res.on('close', () => {
            if (!ended) failTransport();
          });
          res.on('end', () => {
            ended = true;
            done(() => {
              conn.destroy();
              resolve(Buffer.concat(chunks).toString('utf8'));
            });
          });
          res.on('error', failTransport);
        });
        req.end(payload);
      })
      .catch((e: unknown) => {
        done(() => {
          reject(e instanceof Error ? e : new ChainAdapterError('RPC_FAILURE', 'transport error'));
        });
      });
  });
}
