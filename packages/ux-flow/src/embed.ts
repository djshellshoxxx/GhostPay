import { FlowError } from './errors.js';

/** Fragment prefix a v1 invoice link must carry (mirrors apps/web/public/ghostpay-embed-v1.js PREFIX). */
export const EMBED_PREFIX = '#gpi=v1.';
/** Maximum link length (mirrors MAX_LINK in the embed script). */
export const EMBED_MAX_LINK = 22000;
/** Same-origin script path served by the app. */
export const EMBED_SCRIPT_PATH = '/ghostpay-embed-v1.js';
/** Same-origin optional stylesheet path (class names only, no inline style). */
export const EMBED_CSS_PATH = '/ghostpay-embed-v1.css';

/** Why a link was refused. Order of checks matches the embed script's validLink. */
export type EmbedReason =
  'type' | 'length' | 'app-origin' | 'parse' | 'scheme' | 'origin' | 'credentials' | 'fragment';

/** Escape text for HTML text nodes and quoted attribute values: & < > " ' and backtick. */
export function escapeAttr(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return '&#96;';
    }
  });
}

/** Alias of {@link escapeAttr}; one escaper is used for text and attributes (EMBED-2). */
export const escapeHtml = escapeAttr;

function isLocalhostHttp(u: URL): boolean {
  return u.protocol === 'http:' && u.hostname === 'localhost';
}

/**
 * Validate an invoice link exactly as the embed script does: https (or http on localhost), same origin as the app,
 * no userinfo, v1 invoice fragment, bounded length.
 * @param appOrigin canonical origin (`new URL(x).origin`) of the GhostPay deployment serving the script
 * @security Shared rules with ghostpay-embed-v1.js; a mismatch would let the generator emit buttons the script disables.
 */
export function validateEmbedLink(link: unknown, appOrigin: string): 'ok' | EmbedReason {
  if (typeof link !== 'string' || link.length === 0) return 'type';
  if (link.length > EMBED_MAX_LINK) return 'length';
  if (typeof appOrigin !== 'string' || appOrigin === '') return 'app-origin';
  let app: URL;
  try {
    app = new URL(appOrigin);
  } catch {
    return 'app-origin';
  }
  if (app.origin !== appOrigin || (app.protocol !== 'https:' && !isLocalhostHttp(app))) return 'app-origin';
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return 'parse';
  }
  if (u.protocol !== 'https:' && !isLocalhostHttp(u)) return 'scheme';
  if (u.origin !== appOrigin) return 'origin';
  if (u.username !== '' || u.password !== '') return 'credentials';
  if (!u.hash.startsWith(EMBED_PREFIX) || u.hash.length <= EMBED_PREFIX.length) return 'fragment';
  return 'ok';
}

/** Button style variants (class names only; styling lives in the same-origin stylesheet). */
export type EmbedVariant = 'default' | 'dark' | 'outline';

/** Allowlisted snippet options. Unknown keys are rejected. */
export interface SnippetOptions {
  readonly label?: string;
  readonly variant?: EmbedVariant;
  /** Add a `<link rel="stylesheet">` to the same-origin stylesheet. */
  readonly includeStylesheet?: boolean;
  /** Add a plain `<a>` fallback inside `<noscript>`. */
  readonly includeFallback?: boolean;
}

const ALLOWED_KEYS = new Set(['label', 'variant', 'includeStylesheet', 'includeFallback']);
const VARIANTS = new Set<string>(['default', 'dark', 'outline']);
const MAX_LABEL = 80;
const DEFAULT_LABEL = 'Pay with GhostPay';

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Generate a copy-paste checkout snippet: one button, one same-origin script, optional stylesheet link and noscript
 * fallback link. No inline style, no inline script, no third-party host, no event-handler attributes (CSP-friendly).
 *
 * @security The invoice link is a bearer secret: embedding it in public HTML publishes it. Generate per order.
 *   Output is escaped for text and attribute contexts; the link is re-serialised from the parsed URL.
 *   The script is served from `appOrigin`, so `script-src 'self'`-style policies on the app origin apply; add that
 *   origin to the merchant page CSP script-src. No SRI (the file is first-party and versioned by path).
 * @throws FlowError BAD_LINK | BAD_ORIGIN | BAD_LABEL | BAD_OPTION
 */
export function makeSnippet(link: string, appOrigin: string, opts: SnippetOptions = {}): string {
  for (const k of Object.keys(opts)) if (!ALLOWED_KEYS.has(k)) throw new FlowError('BAD_OPTION', k);
  const variant = opts.variant ?? 'default';
  if (!VARIANTS.has(variant)) throw new FlowError('BAD_OPTION', 'variant');
  const label = opts.label ?? DEFAULT_LABEL;
  if (
    typeof label !== 'string' ||
    label.trim() === '' ||
    label.length > MAX_LABEL ||
    CONTROL_RE.test(label)
  ) {
    throw new FlowError('BAD_LABEL');
  }
  const verdict = validateEmbedLink(link, appOrigin);
  if (verdict === 'app-origin') throw new FlowError('BAD_ORIGIN');
  if (verdict !== 'ok') throw new FlowError('BAD_LINK', verdict);
  const href = escapeAttr(new URL(link).href);
  const origin = escapeAttr(appOrigin);
  const text = escapeAttr(label.trim());
  const lines: string[] = [];
  if (opts.includeStylesheet === true)
    lines.push(`<link rel="stylesheet" href="${origin}${EMBED_CSS_PATH}">`);
  lines.push(
    `<button type="button" class="ghostpay-btn ghostpay-btn--${variant}" data-ghostpay data-invoice="${href}">${text}</button>`,
  );
  if (opts.includeFallback === true) {
    lines.push(
      `<noscript><a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a></noscript>`,
    );
  }
  lines.push(`<script defer src="${origin}${EMBED_SCRIPT_PATH}"></script>`);
  return lines.join('\n');
}
