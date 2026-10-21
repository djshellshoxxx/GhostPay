/**
 * Typed failure classes. Messages are fixed strings: they never include any part
 * of the (possibly secret, attacker-controlled) input. `path` is only ever a
 * schema-defined field name such as `amount` or `entries[3].handle`.
 */
export type LinkErrorCode =
  | 'URI_FORMAT'
  | 'URI_TOO_LARGE'
  | 'TARGET'
  | 'PARAM'
  | 'SECRET_IN_QUERY'
  | 'FRAGMENT'
  | 'AMOUNT'
  | 'TEXT'
  | 'QR'
  | 'REQUEST'
  | 'HANDLE'
  | 'BOOK'
  | 'TIP';

/** Base (and only) error class thrown by this package. */
export class LinkError extends Error {
  public readonly code: LinkErrorCode;
  public readonly path: string | undefined;

  public constructor(code: LinkErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
    this.path = path;
  }
}

/** Shorthand used internally: `fail('AMOUNT', 'amount')`. */
export function fail(code: LinkErrorCode, path?: string): never {
  throw new LinkError(code, `invalid ${code.toLowerCase().replace(/_/g, ' ')}`, path);
}
