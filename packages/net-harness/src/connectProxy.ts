import net from 'node:net';
import { assertLoopback, isLoopbackHost, listenLoopback, trackSockets, type Running } from './loopback.js';

/** One CONNECT request seen by the fake HTTP proxy. */
export interface ConnectRecord {
  /** Request target exactly as sent (`host:port`). */
  readonly target: string;
  /** Header lines (lower-cased names). */
  readonly headers: Readonly<Record<string, string>>;
  /** Status the proxy answered with. */
  readonly status: number;
}

/** Options for {@link startConnectProxy}. */
export interface ConnectProxyOptions {
  /** Loopback bind host. Default `127.0.0.1`. */
  readonly host?: string;
  /** Fake name resolution by the proxy: name -> loopback host. Unknown names get 502. */
  readonly hosts?: Readonly<Record<string, string>>;
  /** Force a status line (e.g. 403) instead of tunnelling. */
  readonly forceStatus?: number;
  /** Answer 200 with an oversized header block (parser stress). */
  readonly hugeHeaders?: boolean;
  /** Send a malformed status line. */
  readonly malformed?: boolean;
}

/** Running fake HTTP CONNECT proxy (I2P-style outproxy stand-in). */
export interface ConnectProxy extends Running {
  /** Recorded CONNECT requests. */
  readonly records: readonly ConnectRecord[];
}

/**
 * Starts a fake HTTP/1.1 CONNECT proxy on loopback. The proxy resolves names itself from `hosts`.
 *
 * @security test-only; loopback only.
 * @param opts Options.
 */
export async function startConnectProxy(opts: ConnectProxyOptions = {}): Promise<ConnectProxy> {
  const host = opts.host ?? '127.0.0.1';
  assertLoopback(host, 'connect proxy bind host');
  const records: ConnectRecord[] = [];
  const server = net.createServer((client) => {
    client.on('error', () => undefined);
    let buf = Buffer.alloc(0);
    const onData = (d: Buffer): void => {
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      client.off('data', onData);
      const head = buf.subarray(0, end).toString('latin1').split('\r\n');
      const rest = buf.subarray(end + 4);
      const [line, ...hs] = head as [string, ...string[]];
      const m = /^CONNECT (\S+) HTTP\/1\.1$/.exec(line);
      const headers: Record<string, string> = {};
      for (const h of hs) {
        const i = h.indexOf(':');
        if (i > 0) headers[h.slice(0, i).toLowerCase()] = h.slice(i + 1).trim();
      }
      const finish = (status: number, target: string): void => {
        records.push({ target, headers, status });
      };
      if (m === null) {
        finish(400, line);
        client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const target = m[1] as string;
      const idx = target.lastIndexOf(':');
      const name = target.slice(0, idx);
      const port = Number(target.slice(idx + 1));
      if (opts.forceStatus !== undefined) {
        finish(opts.forceStatus, target);
        client.end(`HTTP/1.1 ${String(opts.forceStatus)} Forced\r\n\r\n`);
        return;
      }
      const dest = opts.hosts?.[name] ?? (isLoopbackHost(name) ? name : undefined);
      if (dest === undefined || !isLoopbackHost(dest)) {
        finish(502, target);
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        return;
      }
      const up = net.connect({ host: dest, port });
      sockets.add(up);
      up.once('close', () => sockets.delete(up));
      up.on('error', () => {
        finish(502, target);
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
      up.once('connect', () => {
        finish(200, target);
        if (opts.malformed === true) client.write('HTTP/1.1 banana\r\n\r\n');
        else if (opts.hugeHeaders === true) client.write(`HTTP/1.1 200 OK\r\nx: ${'a'.repeat(70_000)}\r\n\r\n`);
        else client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (rest.length > 0) up.write(rest);
        client.pipe(up);
        up.pipe(client);
        client.on('close', () => up.destroy());
        up.on('close', () => client.destroy());
      });
    };
    client.on('data', onData);
  });
  const sockets = trackSockets(server);
  const running = await listenLoopback(server, host, sockets);
  return Object.assign(running, { records });
}
