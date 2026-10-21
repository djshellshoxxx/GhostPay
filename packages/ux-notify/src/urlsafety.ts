/**
 * URL secrecy heuristics shared by the manifest validator and cache planner.
 *
 * @security Payment links and auth flows carry secrets in query strings and
 * fragments. Anything matching here must never be cached or put in a manifest.
 */

const SENSITIVE_SUBSTRINGS: readonly string[] = [
  'token', 'secret', 'key', 'auth', 'sig', 'pass', 'seed', 'mnemonic', 'session', 'jwt',
  'cookie', 'bearer', 'code', 'otp', 'pin', 'invoice', 'payload', 'psbt', 'view', 'nonce', 'cred',
];

/** True if a query string has a secret-looking key or a long opaque value. */
export function hasSensitiveQuery(search: string): boolean {
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (q === '') return false;
  for (const part of q.split('&')) {
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? '' : part.slice(eq + 1);
    const key = safeDecode(rawKey).toLowerCase();
    const val = safeDecode(rawVal);
    if (SENSITIVE_SUBSTRINGS.some((s) => key.includes(s))) return true;
    if (/^[A-Za-z0-9+/_=-]{32,}$/.test(val)) return true;
  }
  return false;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
