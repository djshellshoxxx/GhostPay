// Configuration is an origin, never a path, credential or URL prefix. Match the canonical browser
// serialization, including default ports. Plain HTTP is reserved for explicit local fixtures.
export function parseApprovedOrigin(value, allowLoopback = false) {
  if (typeof value !== 'string' || value.length > 300 || /\s/.test(value)) throw new Error('Invalid hosting origin');
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/i.test(value)) {
    if (!allowLoopback || !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/i.test(value)) {
      throw new Error('Expected an HTTPS hosting origin without a path, credentials, query or fragment.');
    }
  }
  return new URL(value).origin;
}
