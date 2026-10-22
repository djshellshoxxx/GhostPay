import net from 'node:net';
import { NetTransportError } from './errors.js';

/** Parsed proxy endpoint. */
export interface ProxyEndpoint {
  /** IP literal to connect to (never a name that needs local DNS). */
  readonly host: string;
  /** TCP port. */
  readonly port: number;
  /** Always true: hostnames are sent to the proxy, not resolved locally. */
  readonly remoteDns: true;
}

/** Options for {@link parseProxyUrl}. */
export interface ProxyUrlOptions {
  /** Permit a non-loopback proxy IP. Default false: Tor/Nym/i2pd are expected on loopback. */
  readonly allowNonLoopback?: boolean;
}

const LOCAL_DNS_SCHEMES = new Set(['socks5:', 'socks4:', 'socks4a:']);

/**
 * Parses a SOCKS5h proxy URL.
 *
 * @remarks Accepts `socks5h://` and `socks://` (remote DNS). Rejects `socks5://`, `socks4://`,
 * `socks4a://` with `PROXY_LOCAL_DNS` (in many clients `socks5://` resolves names locally, a DNS leak:
 * NP-T-3). The host must be an IP literal or `localhost` (mapped to `127.0.0.1`), so connecting to the
 * proxy itself never triggers a local DNS lookup. An explicit port is required. Credentials, path,
 * query and fragment are rejected.
 * @param raw URL string.
 * @param opts Options.
 * @throws {NetTransportError} `PROXY_LOCAL_DNS` or `INVALID_CONFIG`; messages never echo the URL.
 */
export function parseProxyUrl(raw: string, opts: ProxyUrlOptions = {}): ProxyEndpoint {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new NetTransportError('INVALID_CONFIG', 'proxy URL is not valid');
  }
  if (LOCAL_DNS_SCHEMES.has(u.protocol)) {
    throw new NetTransportError('PROXY_LOCAL_DNS', 'proxy scheme resolves names locally; use socks5h');
  }
  if (u.protocol !== 'socks5h:' && u.protocol !== 'socks:') {
    throw new NetTransportError('INVALID_CONFIG', 'proxy scheme must be socks5h');
  }
  if (u.username !== '' || u.password !== '') throw new NetTransportError('INVALID_CONFIG', 'proxy URL credentials not allowed');
  if ((u.pathname !== '' && u.pathname !== '/') || u.search !== '' || u.hash !== '') {
    throw new NetTransportError('INVALID_CONFIG', 'proxy URL must be scheme://host:port only');
  }
  return endpoint(u, opts);
}

/**
 * Parses an HTTP proxy URL (i2pd outproxy style, CONNECT). Same host rules as {@link parseProxyUrl}.
 *
 * @param raw `http://127.0.0.1:4444`-style URL.
 * @param opts Options.
 * @throws {NetTransportError} `INVALID_CONFIG`.
 */
export function parseHttpProxyUrl(raw: string, opts: ProxyUrlOptions = {}): ProxyEndpoint {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new NetTransportError('INVALID_CONFIG', 'proxy URL is not valid');
  }
  if (u.protocol !== 'http:') throw new NetTransportError('INVALID_CONFIG', 'http proxy URL must use http');
  if (u.username !== '' || u.password !== '') throw new NetTransportError('INVALID_CONFIG', 'proxy URL credentials not allowed');
  if (u.pathname !== '/' || u.search !== '' || u.hash !== '') {
    throw new NetTransportError('INVALID_CONFIG', 'proxy URL must be scheme://host:port only');
  }
  return endpoint(u, opts);
}

function endpoint(u: URL, opts: ProxyUrlOptions): ProxyEndpoint {
  if (u.port === '') throw new NetTransportError('INVALID_CONFIG', 'proxy URL needs an explicit port');
  const port = Number(u.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new NetTransportError('INVALID_CONFIG', 'proxy port out of range');
  let host = u.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === 'localhost') host = '127.0.0.1';
  if (net.isIP(host) === 0) throw new NetTransportError('INVALID_CONFIG', 'proxy host must be an IP literal or localhost');
  const loopback = host === '::1' || host.startsWith('127.');
  if (!loopback && opts.allowNonLoopback !== true) {
    throw new NetTransportError('INVALID_CONFIG', 'proxy must be on loopback unless explicitly allowed');
  }
  return { host, port, remoteDns: true };
}
