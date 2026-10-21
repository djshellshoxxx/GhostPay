// Build-time CSP tightening (S3-11). By default connect-src stays `'self' https: wss:` because RPC and relayer origins are
// user data. When GHOSTPAY_CONNECT_ORIGINS lists origins (comma separated, https:// or wss:// origins without a path),
// connect-src becomes `'self'` plus exactly those origins, in the meta CSP and in `_headers`. Origins a user adds later in
// Settings are then blocked by the browser until the host's `_headers` is edited (see README).
export const BROAD = "connect-src 'self' https: wss:";

export function parseOrigins(text) {
  const out = [];
  for (const raw of (text ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      throw new Error(`GHOSTPAY_CONNECT_ORIGINS: not a URL: ${raw}`);
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'wss:') || u.username !== '' || u.password !== '' || u.pathname !== '/' || u.search !== '' || u.hash !== '') {
      throw new Error(`GHOSTPAY_CONNECT_ORIGINS: use a bare https:// or wss:// origin: ${raw}`);
    }
    if (!out.includes(u.origin)) out.push(u.origin);
  }
  return out;
}

export function connectSrc(origins) {
  return origins.length === 0 ? BROAD : `connect-src 'self' ${origins.join(' ')}`;
}

export function applyConnectSrc(text, origins) {
  return origins.length === 0 ? text : text.split(BROAD).join(connectSrc(origins));
}
