// Build-time CSP tightening (S3-11). By default connect-src stays `'self' https: wss:` because RPC and relayer origins are
// user data. When GHOSTPAY_CONNECT_ORIGINS lists origins (comma separated, https:// or wss:// origins without a path),
// connect-src becomes `'self'` plus exactly those origins, in the meta CSP and in `_headers`. Origins a user adds later in
// Settings are then blocked by the browser until the artifacts are rebuilt (see deploy/BUILD-WEB.md).
export const BROAD = "connect-src 'self' https: wss:";

// An origin is inserted into HTML, a CSP source list and optionally an nginx quoted string.
// URL() alone accepts wildcards, punctuation and repaired/whitespace-stripped URLs which are unsafe here.
// Never echo the input: a mistaken path/query/userinfo may contain a real endpoint credential.
function origin(raw) {
  const invalid = () => new Error('GHOSTPAY_CONNECT_ORIGINS: use a bare HTTPS/WSS origin without credentials, wildcards or policy syntax');
  if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw) && !/^wss:\/\//i.test(raw)
      || /[\s\\,;"'<>`$]/u.test(raw)) throw invalid();
  let u;
  try { u = new URL(raw); } catch { throw invalid(); }
  const host = u.hostname;
  const safeHost = /^[a-z0-9.-]+$/i.test(host) || /^\[[0-9a-f:.]+\]$/i.test(host);
  if ((u.protocol !== 'https:' && u.protocol !== 'wss:') || !safeHost || host === ''
      || u.username !== '' || u.password !== '' || u.pathname !== '/' || u.search !== '' || u.hash !== '') throw invalid();
  return u.origin;
}

export function parseOrigins(text) {
  if (text === undefined || text === null || text.trim() === '') return [];
  const out = [];
  for (const raw of text.split(',').map((s) => s.trim())) {
    const normalized = origin(raw);
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

export function connectSrc(origins) {
  const normalized = [...new Set(origins.map(origin))];
  return normalized.length === 0 ? BROAD : `connect-src 'self' ${normalized.join(' ')}`;
}

export function applyConnectSrc(text, origins) {
  return origins.length === 0 ? text : text.split(BROAD).join(connectSrc(origins));
}

/** Checks an actual policy value, not surrounding HTML, comments, or report-only text. */
export function checkConnectSrc(policy, origins) {
  const want = connectSrc(origins);
  const found = policy.split(';').map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => /^connect-src(?:\s|$)/i.test(part));
  if (found.length !== 1) return ['expected exactly one connect-src directive'];
  if (found[0] === want) return [];
  return [found[0] === BROAD && origins.length !== 0
    ? 'still has the broad connect-src; expected the configured origin list'
    : 'connect-src differs from the expected configured origin list'];
}
