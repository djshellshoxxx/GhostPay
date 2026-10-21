import { NetTransportError } from './errors.js';

/** Options for {@link parseTargetUrl}. */
export interface TargetUrlOptions {
  /** Permit `http:` (tests, onion profile). Default false: https only. */
  readonly allowPlainHttp?: boolean;
}

/** A parsed destination. */
export interface Target {
  /** The parsed URL. */
  readonly url: URL;
  /** Hostname as parsed (punycode for IDNs; `[v6]` for IPv6). */
  readonly host: string;
  /** Effective port. */
  readonly port: number;
  /** True for `https:`. */
  readonly tls: boolean;
  /** Request path plus query. */
  readonly path: string;
}

/**
 * Parses and validates a request destination.
 *
 * @security Rejects userinfo and fragments (they leak into logs/referrers), non-http(s) schemes and
 * empty hosts. Plain http only with an explicit opt-in. Errors never echo the URL.
 * @param raw URL string.
 * @param o Options.
 * @throws {NetTransportError} `URL_REJECTED`.
 */
export function parseTargetUrl(raw: string, o: TargetUrlOptions = {}): Target {
  const bad = (): never => {
    throw new NetTransportError('URL_REJECTED', 'destination URL rejected');
  };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return bad();
  }
  if (u.username !== '' || u.password !== '' || u.hash !== '' || u.hostname === '') return bad();
  const tls = u.protocol === 'https:';
  if (!tls && !(u.protocol === 'http:' && o.allowPlainHttp === true)) return bad();
  const port = u.port === '' ? (tls ? 443 : 80) : Number(u.port);
  return { url: u, host: u.hostname, port, tls, path: `${u.pathname}${u.search}` };
}
