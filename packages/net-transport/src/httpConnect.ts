import net from 'node:net';
import { NetTransportError } from './errors.js';
import { SocketReader } from './socketReader.js';
import type { ProxyEndpoint } from './proxyUrl.js';

/** Options for {@link httpConnect}. */
export interface HttpConnectOptions {
  /** Proxy endpoint. */
  readonly proxy: ProxyEndpoint;
  /** Destination host as produced by the URL parser. */
  readonly host: string;
  /** Destination port. */
  readonly port: number;
  /** Deadline for TCP connect plus the CONNECT exchange, ms. */
  readonly timeoutMs: number;
}

/** Longest CONNECT response head accepted. */
export const MAX_CONNECT_HEAD = 16 * 1024;

/**
 * Opens a tunnel through an HTTP proxy with `CONNECT host:port` (i2pd/outproxy style). The destination
 * NAME is sent to the proxy; nothing is resolved locally.
 *
 * @param o Options.
 * @returns A connected, paused socket (leftover bytes pushed back).
 * @throws {NetTransportError} `HTTP_PROXY` (non-200, malformed, oversize head), `PROXY_CONNECT`,
 * `URL_REJECTED`.
 */
export async function httpConnect(o: HttpConnectOptions): Promise<net.Socket> {
  // eslint-disable-next-line no-control-regex
  if (o.host === '' || /[\u0000- \u007f]/.test(o.host) || !Number.isInteger(o.port) || o.port < 1 || o.port > 65535) {
    throw new NetTransportError('URL_REJECTED', 'destination host cannot be sent to the proxy');
  }
  const authority = `${o.host}:${String(o.port)}`;
  const sock = net.connect({ host: o.proxy.host, port: o.proxy.port });
  const reader = new SocketReader(sock, o.timeoutMs);
  try {
    sock.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    const head = await reader.takeUntil('\r\n\r\n', MAX_CONNECT_HEAD, new NetTransportError('HTTP_PROXY', 'proxy response head too large'));
    const line = head.toString('latin1').split('\r\n', 1)[0] as string;
    const m = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(line);
    if (m === null) throw new NetTransportError('HTTP_PROXY', 'malformed proxy response');
    if (m[1] !== '200') throw new NetTransportError('HTTP_PROXY', `proxy refused the tunnel (status ${m[1] as string})`);
    reader.detach();
    return sock;
  } catch (e) {
    reader.dispose();
    sock.destroy();
    throw e;
  }
}
