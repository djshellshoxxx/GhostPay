/** Stable error codes thrown by this package. */
export type NetTransportErrorCode =
  | 'PROXY_LOCAL_DNS'
  | 'PROXY_CONNECT'
  | 'PROXY_AUTH'
  | 'SOCKS_REPLY'
  | 'HTTP_PROXY'
  | 'ONION_URL'
  | 'URL_REJECTED'
  | 'OHTTP_KEYCONFIG'
  | 'OHTTP_FRAMING'
  | 'OHTTP_DECAP'
  | 'PROFILE_SELFTEST'
  | 'UNSUPPORTED_ENV'
  | 'INVALID_CONFIG'
  | 'NETWORK_NOT_ALLOWED';

/**
 * Error carrying a stable {@link NetTransportErrorCode}.
 *
 * @security Messages are fixed strings. They never contain URLs, hostnames, `.onion` addresses,
 * proxy credentials, purpose/session ids or request data (NP-T-6, PO-RPC-6). Do not add caller data.
 */
export class NetTransportError extends Error {
  /** Machine-readable code. */
  public readonly code: NetTransportErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: NetTransportErrorCode, message: string) {
    super(message);
    this.name = 'NetTransportError';
    this.code = code;
  }
}

/** @internal Throws INVALID_CONFIG unless `ok`. */
export function requireConfig(ok: boolean, message: string): void {
  if (!ok) throw new NetTransportError('INVALID_CONFIG', message);
}
