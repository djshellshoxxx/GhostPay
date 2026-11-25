import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { MetadataHardeningError } from './errors.js';
import { asciiLower, fail, isLoopbackHost, requireArray, requireBytes } from './validate.js';

/** Result of an anchor audit. */
export interface UnsafeAnchor {
  readonly index: number;
  readonly reason: 'MISSING_REL' | 'MISSING_NOREFERRER' | 'MISSING_NOOPENER';
}

/** Largest markup string {@link findUnsafeAnchors} accepts (UTF-16 units): a built page, not a crawl. */
export const MAX_MARKUP_LENGTH = 4 * 1024 * 1024;

/** HTML "ASCII whitespace": TAB, LF, FF, CR, SPACE. */
function isHtmlSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;
}

interface AnchorAttrs {
  target?: string;
  rel?: string;
}

/**
 * Reads the attributes of one start tag whose name ended at `pos`, following the HTML tokeniser
 * rules that matter here: quoted values may contain `>`, unquoted values end at whitespace or `>`,
 * the first duplicate attribute wins. Single forward pass.
 *
 * @returns Index just after the closing `>`, or -1 when the input ends inside the tag (an HTML
 * parser drops such a tag, so nothing after it is a tag either).
 */
function readAnchorAttrs(s: string, start: number, out: AnchorAttrs): number {
  const n = s.length;
  let pos = start;
  for (;;) {
    while (pos < n && (isHtmlSpace(s.charCodeAt(pos)) || s.charCodeAt(pos) === 0x2f)) pos++;
    if (pos >= n) return -1;
    if (s.charCodeAt(pos) === 0x3e) return pos + 1;
    const nameStart = pos++; // a leading "=" is part of the name, as in HTML
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (isHtmlSpace(c) || c === 0x2f || c === 0x3e || c === 0x3d) break;
      pos++;
    }
    const name = asciiLower(s.slice(nameStart, pos));
    while (pos < n && isHtmlSpace(s.charCodeAt(pos))) pos++;
    let value = '';
    if (pos < n && s.charCodeAt(pos) === 0x3d) {
      pos++;
      while (pos < n && isHtmlSpace(s.charCodeAt(pos))) pos++;
      if (pos >= n) return -1;
      const q = s[pos];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, pos + 1);
        if (close === -1) return -1;
        value = s.slice(pos + 1, close);
        pos = close + 1;
      } else if (s.charCodeAt(pos) !== 0x3e) {
        const vs = pos;
        while (pos < n && !isHtmlSpace(s.charCodeAt(pos)) && s.charCodeAt(pos) !== 0x3e) pos++;
        value = s.slice(vs, pos);
      }
    }
    if (name === 'target' && out.target === undefined) out.target = value;
    else if (name === 'rel' && out.rel === undefined) out.rel = value;
  }
}

/**
 * MH-WEB-1 R3: finds `<a target="_blank">` tags without `rel` containing `noreferrer` and
 * `noopener`.
 *
 * @remarks A forward tokeniser over markup text, linear in its length: a lint aid, not an HTML
 * parser. `index` is the ordinal of the anchor among all anchors. It does not skip comments or
 * `<script>` bodies (conservative), does not decode character references in `target` or `rel`
 * (so `target="&#95;blank"` is missed), and does not
 * understand JSX: run it over rendered HTML. Only the `_blank` keyword is checked (ASCII
 * case-insensitive, exact); `rel` tokens split on HTML whitespace only, so a no-break space does
 * not separate tokens.
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` for a non-string (never "no findings"),
 * `LIMIT_EXCEEDED` above {@link MAX_MARKUP_LENGTH}.
 */
export function findUnsafeAnchors(markup: string): UnsafeAnchor[] {
  if (typeof markup !== 'string') fail('markup must be a string');
  if (markup.length > MAX_MARKUP_LENGTH) throw new MetadataHardeningError('LIMIT_EXCEEDED', 'markup is too large');
  const out: UnsafeAnchor[] = [];
  let from = 0;
  let index = 0;
  for (;;) {
    const lt = markup.indexOf('<', from);
    if (lt === -1) break;
    from = lt + 1;
    const letter = markup.charCodeAt(lt + 1);
    const after = markup.charCodeAt(lt + 2);
    if ((letter !== 0x61 && letter !== 0x41) || !(isHtmlSpace(after) || after === 0x2f || after === 0x3e)) continue;
    const attrs: AnchorAttrs = {};
    const end = readAnchorAttrs(markup, lt + 2, attrs);
    if (end === -1) break;
    from = end;
    const idx = index++;
    if (attrs.target === undefined || asciiLower(attrs.target) !== '_blank') continue;
    if (attrs.rel === undefined) {
      out.push({ index: idx, reason: 'MISSING_REL' });
      continue;
    }
    const tokens = asciiLower(attrs.rel).split(/[ \t\n\f\r]+/);
    if (!tokens.includes('noreferrer')) out.push({ index: idx, reason: 'MISSING_NOREFERRER' });
    else if (!tokens.includes('noopener')) out.push({ index: idx, reason: 'MISSING_NOOPENER' });
  }
  return out;
}

const MAX_ORIGINS = 32;
const MAX_ORIGIN_LENGTH = 512;
/** CSP host-source grammar: ALPHA / DIGIT / "-" labels (punycode for IDN), or a bracketed IPv6 literal. */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV6_LITERAL = /^\[[0-9a-f:.]{2,45}\]$/;

function isCspHost(hostname: string): boolean {
  if (hostname.startsWith('[')) return IPV6_LITERAL.test(hostname);
  return hostname.length <= 253 && hostname.split('.').every((label) => DNS_LABEL.test(label));
}

/**
 * MH-WEB-2b: normalises configured RPC/relayer origins to `connect-src` sources.
 *
 * @remarks Accepts `https:`/`wss:` origins, and `http:`/`ws:` for loopback only. Paths, queries,
 * credentials and wildcards are rejected, and so is any host that is not plain CSP host-source
 * grammar, so an entry can never add a directive or a second policy (`;`, `,`, quotes). Entries
 * must be strings (no coercion). Duplicates collapse. A meta CSP cannot be tightened after load,
 * so a changed list needs a reload.
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` (also for more than 32 origins); the
 * message never contains an origin.
 */
export function buildConnectSources(origins: readonly string[]): string[] {
  requireArray(origins, 'origins', MAX_ORIGINS, 'INVALID_INPUT');
  const set = new Set<string>();
  for (const o of origins) {
    if (typeof o !== 'string' || o.length > MAX_ORIGIN_LENGTH) fail('origin is not a valid URL');
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused here
    if (/[\u0000- \u007f?#\\]/.test(o)) fail('origin must be a bare https/wss origin');
    let u: URL;
    try {
      u = new URL(o);
    } catch {
      throw new MetadataHardeningError('INVALID_INPUT', 'origin is not a valid URL');
    }
    const loop = isLoopbackHost(u.hostname);
    const ok = u.protocol === 'https:' || u.protocol === 'wss:' || ((u.protocol === 'http:' || u.protocol === 'ws:') && loop);
    if (!ok || u.username !== '' || u.password !== '' || (u.pathname !== '' && u.pathname !== '/') || !isCspHost(u.hostname)) {
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
 *
 * @remarks Exactly six directives, whatever the list. `base-uri` and `form-action` do not fall
 * back to `default-src`; adding them is a deployment decision outside this builder (see README).
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

type SriAlgo = 'sha256' | 'sha384' | 'sha512';
const STRENGTH: Readonly<Record<SriAlgo, number>> = { sha256: 1, sha384: 2, sha512: 3 };
/** Longest `integrity` attribute value considered; longer is treated as malformed (fail closed). */
const MAX_INTEGRITY_LENGTH = 4096;

function digestBase64(algo: SriAlgo, bytes: Uint8Array): string {
  const raw = algo === 'sha256' ? sha256(bytes) : algo === 'sha384' ? sha384(bytes) : sha512(bytes);
  let s = '';
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s);
}

function isSriAlgo(v: unknown): v is SriAlgo {
  return v === 'sha256' || v === 'sha384' || v === 'sha512';
}

/**
 * MH-WEB-3: SRI string `sha384-<base64>` (default) for a file.
 *
 * @remarks Does NOT protect against a tampered `index.html`. Not a metadata hide: it stops a host
 * silently swapping a script that could leak metadata.
 * @throws {MetadataHardeningError} `INVALID_INPUT` for non-bytes or an unknown algorithm.
 */
export function sriDigest(bytes: Uint8Array, algo: SriAlgo = 'sha384'): string {
  requireBytes(bytes, 'bytes', 0, Number.MAX_SAFE_INTEGER);
  if (!isSriAlgo(algo)) fail('unknown SRI algorithm');
  return `${algo}-${digestBase64(algo, bytes)}`;
}

/**
 * MH-WEB-3 R2/R3: checks bytes against an `integrity` attribute value, following W3C SRI
 * "parse metadata" and "match": tokens split on HTML whitespace, options after `?` ignored,
 * algorithm names ASCII case-insensitive, unknown algorithms skipped. Only the strongest algorithm
 * present is considered, and a token of that algorithm with a malformed value still counts (it
 * can never match), so a weaker valid hash cannot rescue it. Any one hash of the strongest
 * algorithm may match; the base64 comparison is case-sensitive.
 *
 * @remarks Stricter than the spec in one place: empty or all-unknown metadata returns `false`
 * here (the spec treats it as "no integrity required"); a non-string or over-long value is `false`.
 * @throws {MetadataHardeningError} `INVALID_INPUT` when `bytes` is not a `Uint8Array`.
 */
export function verifySri(bytes: Uint8Array, integrity: string): boolean {
  requireBytes(bytes, 'bytes', 0, Number.MAX_SAFE_INTEGER);
  if (typeof integrity !== 'string' || integrity.length > MAX_INTEGRITY_LENGTH) return false;
  const entries: { algo: SriAlgo; value: string }[] = [];
  for (const token of integrity.split(/[ \t\n\f\r]+/)) {
    const bare = token.split('?')[0] ?? '';
    const dash = bare.indexOf('-');
    const algo = asciiLower(dash < 0 ? bare : bare.slice(0, dash));
    // Everything after the first "-" is the value, so trailing text after the hash can never match
    // (the spec reads only the segment up to the next "-").
    if (isSriAlgo(algo)) entries.push({ algo, value: dash < 0 ? '' : bare.slice(dash + 1) });
  }
  if (entries.length === 0) return false;
  const best = Math.max(...entries.map((e) => STRENGTH[e.algo]));
  const strongest = entries.filter((e) => STRENGTH[e.algo] === best);
  const actual = digestBase64(strongest[0]?.algo as SriAlgo, bytes);
  return strongest.some((e) => e.value === actual);
}
