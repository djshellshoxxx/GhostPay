import { NetTransportError, requireConfig } from './errors.js';

/** Request purpose labels (spec 4.1). */
export const PURPOSES = ['scan-bulk', 'read-address', 'quote', 'sweep', 'submit', 'health'] as const;
/** Purpose of a request; selects the isolation class. */
export type Purpose = (typeof PURPOSES)[number];

/** How SOCKS credentials are rotated. */
export type Isolation = 'per-purpose' | 'per-request' | 'none';

/** RFC 1929 credentials. */
export interface SocksCredentials {
  /** `gp1-<purpose>-<sessionId>`. */
  readonly username: string;
  /** 16 random bytes, hex. */
  readonly password: string;
}

/** Random byte source. Injected in tests; default is WebCrypto. */
export type RandomBytes = (n: number) => Uint8Array;

/** Default CSPRNG (`crypto.getRandomValues`). */
export const defaultRandom: RandomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

function hex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** Purposes that share one circuit per app session when `per-purpose` (spec 4.1). */
const SESSION_SCOPED: ReadonlySet<Purpose> = new Set<Purpose>(['scan-bulk', 'health']);

/**
 * Generates SOCKS credentials per the isolation policy.
 *
 * @security Credentials come only from the random source: never from keys, addresses, invoice ids or
 * request content (NP-I-2, PO-COR-8). They are never logged. `scan-bulk` and `read-address` can never
 * share credentials because the username embeds the purpose (NP-I-1).
 */
export class CredentialSource {
  private readonly cache = new Map<Purpose, SocksCredentials>();

  /**
   * @param isolate Rotation policy.
   * @param rand Random byte source.
   */
  public constructor(
    private readonly isolate: Isolation,
    private readonly rand: RandomBytes = defaultRandom,
  ) {
    requireConfig(isolate === 'per-purpose' || isolate === 'per-request' || isolate === 'none', 'unknown isolation');
  }

  private bytes(n: number): Uint8Array {
    const b = this.rand(n);
    if (!(b instanceof Uint8Array) || b.length !== n) throw new NetTransportError('INVALID_CONFIG', 'random source misbehaved');
    return b;
  }

  private fresh(purpose: Purpose): SocksCredentials {
    return { username: `gp1-${purpose}-${hex(this.bytes(8))}`, password: hex(this.bytes(16)) };
  }

  /**
   * Credentials for the next connection.
   *
   * @param purpose Request purpose.
   * @returns Credentials, or `undefined` when isolation is `none` (no auth is offered).
   */
  public next(purpose: Purpose): SocksCredentials | undefined {
    if (!PURPOSES.includes(purpose)) throw new NetTransportError('INVALID_CONFIG', 'unknown purpose');
    if (this.isolate === 'none') return undefined;
    if (this.isolate === 'per-purpose' && SESSION_SCOPED.has(purpose)) {
      let c = this.cache.get(purpose);
      if (c === undefined) {
        c = this.fresh(purpose);
        this.cache.set(purpose, c);
      }
      return c;
    }
    return this.fresh(purpose);
  }
}
