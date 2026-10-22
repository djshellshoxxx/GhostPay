import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { MetadataHardeningError, requireInput } from './guard.js';

/** Result of an anchor audit. */
export interface UnsafeAnchor {
  readonly index: number;
  readonly reason: 'MISSING_REL' | 'MISSING_NOREFERRER' | 'MISSING_NOOPENER';
}

/**
 * MH-WEB-1 R3: finds `<a target="_blank">` tags without `rel` containing `noreferrer` and
 * `noopener`. Regex scan over markup text: a lint aid, not an HTML parser.
 */
export function findUnsafeAnchors(markup: string): UnsafeAnchor[] {
  const out: UnsafeAnchor[] = [];
  const tagRe = /<a\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = tagRe.exec(markup)) !== null) {
    const tag = m[0];
    const idx = i++;
    if (!/\btarget\s*=\s*["']?_blank/i.test(tag)) continue;
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const val = (rel?.[1] ?? rel?.[2] ?? rel?.[3])?.toLowerCase();
    if (val === undefined) out.push({ index: idx, reason: 'MISSING_REL' });
    else {
      const tokens = val.split(/\s+/);
      if (!tokens.includes('noreferrer')) out.push({ index: idx, reason: 'MISSING_NOREFERRER' });
      else if (!tokens.includes('noopener')) out.push({ index: idx, reason: 'MISSING_NOOPENER' });
    }
  }
  return out;
}

const MAX_ORIGINS = 32;

/**
 * MH-WEB-2b: normalises configured RPC/relayer origins to `connect-src` sources.
 *
 * @remarks Accepts `https:`/`wss:` origins, and `http:`/`ws:` for loopback only. Paths, queries,
 * credentials and wildcards are rejected. Duplicates collapse. A meta CSP cannot be tightened
 * after load, so a changed list needs a reload.
 */
export function buildConnectSources(origins: readonly string[]): string[] {
  requireInput(origins.length <= MAX_ORIGINS, 'too many origins');
  const set = new Set<string>();
  for (const o of origins) {
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      throw new MetadataHardeningError('INVALID_INPUT', 'origin is not a valid URL');
    }
    const loop = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    const ok = u.protocol === 'https:' || u.protocol === 'wss:' || ((u.protocol === 'http:' || u.protocol === 'ws:') && loop);
    if (!ok || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '' || u.pathname !== '' && u.pathname !== '/' || u.hostname.includes('*')) {
      throw new MetadataHardeningError('INVALID_INPUT', 'origin must be a bare https/wss origin');
    }
    set.add(u.origin);
  }
  return [...set].sort();
}

/**
 * MH-WEB-2b R1/R3: the full CSP string for a deployment: same-origin everything plus the listed
 * connect origins; never `unsafe-inline`/`unsafe-eval`. Use the same string in `index.html` and
 * `_headers` so a test can assert identity.
 */
export function buildCsp(connectOrigins: readonly string[]): string {
  const connect = ["'self'", ...buildConnectSources(connectOrigins)].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
  ].join('; ');
}

const ALGOS = { sha256, sha384, sha512 } as const;
type SriAlgo = keyof typeof ALGOS;
const STRENGTH: Record<SriAlgo, number> = { sha256: 1, sha384: 2, sha512: 3 };

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * MH-WEB-3: SRI string `sha384-<base64>` (default) for a file.
 *
 * @remarks Does NOT protect against a tampered `index.html`. Not a metadata hide: it stops a host
 * silently swapping a script that could leak metadata.
 */
export function sriDigest(bytes: Uint8Array, algo: SriAlgo = 'sha384'): string {
  return `${algo}-${b64(ALGOS[algo](bytes))}`;
}

/**
 * MH-WEB-3 R2/R3: checks bytes against an `integrity` attribute value. Per SRI, only the
 * strongest algorithm present is considered; any one of its hashes may match. Malformed or
 * unknown-algorithm-only metadata fails closed.
 */
export function verifySri(bytes: Uint8Array, integrity: string): boolean {
  const entries = integrity
    .split(/\s+/)
    .filter((t) => t !== '')
    .map((t) => /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(\?.*)?$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ algo: m[1] as SriAlgo, hash: m[2] as string }));
  if (entries.length === 0) return false;
  const best = Math.max(...entries.map((e) => STRENGTH[e.algo]));
  return entries.filter((e) => STRENGTH[e.algo] === best).some((e) => b64(ALGOS[e.algo](bytes)) === e.hash);
}
