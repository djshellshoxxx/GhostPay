// @ts-check
// Explicit, typed errors for the hosting kit. Every failure the CLI reports carries one of these codes so that
// operators and scripts can branch on it without parsing prose.

/** @typedef {typeof ERROR_CODES[keyof typeof ERROR_CODES]} ErrorCode */

export const ERROR_CODES = Object.freeze({
  USAGE: 'E_USAGE', // bad command line or API argument
  IO: 'E_IO', // filesystem or socket failure
  LIMIT: 'E_LIMIT', // a configured bound (files, bytes, depth, path length) was exceeded
  PATH: 'E_PATH', // unsafe, non-normalized or non-portable path
  POLICY: 'E_POLICY', // file type or name not allowed by the inclusion policy
  ENTRYPOINT: 'E_ENTRYPOINT', // entrypoint missing or not an HTML file
  SYMLINK: 'E_SYMLINK', // symlink or special file in the input
  COLLISION: 'E_COLLISION', // two paths collide on a case-insensitive / Unicode-normalizing host
  SECRET: 'E_SECRET', // configuration secret or runtime state detected
  CONFIG: 'E_CONFIG', // invalid public host configuration
  ARCHIVE: 'E_ARCHIVE', // malformed or unsafe archive
  VERIFY: 'E_VERIFY', // content does not match the manifest
  HEADERS: 'E_HEADERS', // header rules missing, unparsable or weaker than required
  UNSUPPORTED: 'E_UNSUPPORTED', // a requested target cannot meet the security requirements
  NETWORK_SCOPE: 'E_NETWORK_SCOPE', // a listener would leave loopback without explicit authorization
});

/** Process exit codes used by the CLI. */
export const EXIT = Object.freeze({
  OK: 0,
  FAILED: 1, // validation / verification found problems
  USAGE: 2,
  INTERNAL: 3, // I/O or unexpected error
});

export class KitError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'KitError';
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {Record<string, unknown>} */
    this.details = details ?? {};
  }
}

/**
 * @param {unknown} e
 * @returns {e is KitError}
 */
export function isKitError(e) {
  return e instanceof KitError;
}
