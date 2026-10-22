import net from 'node:net';
import { NetTransportError } from './errors.js';
import type { SocksCredentials } from './credentials.js';
import { SocketReader } from './socketReader.js';
import type { ProxyEndpoint } from './proxyUrl.js';

/** Options for {@link socks5Connect}. */
export interface Socks5ConnectOptions {
  /** Proxy endpoint (an IP literal; see {@link parseProxyUrl}). */
  readonly proxy: ProxyEndpoint;
  /** Destination host as the URL parser produced it (name, IPv4, or `[v6]`). */
  readonly host: string;
  /** Destination port. */
  readonly port: number;
  /** RFC 1929 credentials; when absent only method 0x00 is offered. */
  readonly credentials?: SocksCredentials | undefined;
  /** Deadline for TCP connect plus the whole handshake, ms. */
  readonly timeoutMs: number;
}

/** What went wrong in a SOCKS reply, for tests (not shown to users). */
const REPLY_TEXT: Record<number, string> = {
  1: 'general failure',
  2: 'not allowed by ruleset',
  3: 'network unreachable',
  4: 'host unreachable',
  5: 'connection refused',
  6: 'ttl expired',
  7: 'command not supported',
  8: 'address type not supported',
};

/**
 * Encodes the destination for a SOCKS5 CONNECT. Hostnames are ALWAYS sent as ATYP 0x03 (the proxy
 * resolves them: SOCKS5h); only IP literals use ATYP 0x01/0x04.
 *
 * @security No `dns.*` call is made here or anywhere in this package (NP-T-3, tested with a poisoned
 * resolver).
 * @param host Destination host.
 * @param port Destination port.
 * @throws {NetTransportError} `URL_REJECTED` for an empty, over-long (>255 bytes) or control-char name.
 */
export function encodeSocksDestination(host: string, port: number): Buffer {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new NetTransportError('URL_REJECTED', 'destination port out of range');
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const p = Buffer.alloc(2);
  p.writeUInt16BE(port);
  const kind = net.isIP(bare);
  if (kind === 4) return Buffer.concat([Buffer.from([1, ...bare.split('.').map(Number)]), p]);
  if (kind === 6) return Buffer.concat([Buffer.from([4]), ipv6Bytes(bare), p]);
  const name = Buffer.from(host, 'utf8');
  // eslint-disable-next-line no-control-regex
  if (name.length < 1 || name.length > 255 || /[\u0000- \u007f]/.test(host)) {
    throw new NetTransportError('URL_REJECTED', 'destination host cannot be sent to the proxy');
  }
  return Buffer.concat([Buffer.from([3, name.length]), name, p]);
}

function ipv6Bytes(addr: string): Buffer {
  let a = addr;
  const out = Buffer.alloc(16);
  // IPv4-mapped tail (::ffff:1.2.3.4)
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  let tailBytes: number[] = [];
  if (tail !== null) {
    tailBytes = (tail[1] as string).split('.').map(Number);
    a = a.slice(0, a.length - (tail[1] as string).length) + '0:0';
  }
  const [head = '', rest] = a.split('::');
  const h = head === '' ? [] : head.split(':');
  const t = rest === undefined || rest === '' ? [] : rest.split(':');
  const groups = rest === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t];
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  if (tail !== null) Buffer.from(tailBytes).copy(out, 12);
  return out;
}

/**
 * RFC 1928 greeting plus optional RFC 1929 sub-negotiation on an already-connected socket.
 *
 * @internal
 */
export async function socksNegotiate(reader: SocketReader, sock: net.Socket, creds: SocksCredentials | undefined): Promise<void> {
  const method = creds === undefined ? 0x00 : 0x02;
  sock.write(Buffer.from([5, 1, method]));
  const sel = await reader.take(2);
  if (sel[0] !== 5) throw new NetTransportError('SOCKS_REPLY', 'proxy is not speaking SOCKS5');
  if (sel[1] !== method) {
    // 0xFF = no acceptable method; anything else is a method we did not offer. Both fail closed.
    throw new NetTransportError('PROXY_AUTH', 'proxy did not accept the offered authentication method');
  }
  if (creds === undefined) return;
  const u = Buffer.from(creds.username, 'utf8');
  const p = Buffer.from(creds.password, 'utf8');
  if (u.length < 1 || u.length > 255 || p.length < 1 || p.length > 255) {
    throw new NetTransportError('INVALID_CONFIG', 'credential length out of range');
  }
  sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
  const res = await reader.take(2);
  if (res[0] !== 1 || res[1] !== 0) throw new NetTransportError('PROXY_AUTH', 'proxy rejected the credentials');
}

/** Dials the proxy (IP literal, so no DNS) and returns the socket plus its reader. */
function dialProxy(proxy: ProxyEndpoint, timeoutMs: number): { sock: net.Socket; reader: SocketReader } {
  const sock = net.connect({ host: proxy.host, port: proxy.port });
  sock.setNoDelay(true);
  return { sock, reader: new SocketReader(sock, timeoutMs) };
}

/**
 * Opens a TCP tunnel to `host:port` through a SOCKS5(h) proxy and returns the connected socket.
 *
 * @remarks Offers exactly one authentication method: 0x02 when credentials are given (so a proxy that
 * ignores auth cannot silently disable isolation), otherwise 0x00. Any bytes the proxy sent after its
 * reply are pushed back onto the socket. The socket is left paused.
 * @security Fixed error messages; no host, port or credential appears in an error.
 * @param o Options.
 * @throws {NetTransportError} `PROXY_CONNECT`, `PROXY_AUTH`, `SOCKS_REPLY`, `URL_REJECTED`.
 */
export async function socks5Connect(o: Socks5ConnectOptions): Promise<net.Socket> {
  const dest = encodeSocksDestination(o.host, o.port);
  const { sock, reader } = dialProxy(o.proxy, o.timeoutMs);
  try {
    await socksNegotiate(reader, sock, o.credentials);
    sock.write(Buffer.concat([Buffer.from([5, 1, 0]), dest]));
    const head = await reader.take(4);
    if (head[0] !== 5) throw new NetTransportError('SOCKS_REPLY', 'proxy is not speaking SOCKS5');
    const rep = head.readUInt8(1);
    if (rep !== 0) {
      const known = REPLY_TEXT[rep] !== undefined;
      throw new NetTransportError('SOCKS_REPLY', known ? `proxy refused the connection (reply ${String(rep)})` : 'proxy refused the connection (unknown reply)');
    }
    if (head[2] !== 0) throw new NetTransportError('SOCKS_REPLY', 'malformed proxy reply');
    const atyp = head.readUInt8(3);
    if (atyp === 1) await reader.take(4 + 2);
    else if (atyp === 4) await reader.take(16 + 2);
    else if (atyp === 3) {
      const len = (await reader.take(1)).readUInt8(0);
      await reader.take(len + 2);
    } else throw new NetTransportError('SOCKS_REPLY', 'malformed proxy reply');
    reader.detach();
    return sock;
  } catch (e) {
    reader.dispose();
    sock.destroy();
    throw e;
  }
}

/**
 * SOCKS handshake probe for self-tests: greeting plus auth only, no CONNECT.
 *
 * @param proxy Proxy endpoint.
 * @param creds Credentials to authenticate with (or none).
 * @param timeoutMs Deadline.
 * @throws {NetTransportError} As {@link socks5Connect}.
 */
export async function socks5Probe(proxy: ProxyEndpoint, creds: SocksCredentials | undefined, timeoutMs: number): Promise<void> {
  const { sock, reader } = dialProxy(proxy, timeoutMs);
  try {
    await socksNegotiate(reader, sock, creds);
  } finally {
    reader.dispose();
    sock.destroy();
  }
}
