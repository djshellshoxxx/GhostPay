/**
 * Theme pack: token validation, WCAG 2.x contrast checks and injection-proof CSS-variable output.
 *
 * @security Theme data may come from storage or an import, so it is untrusted. Only a closed set of
 * token names is accepted, colour values must be `#rrggbb`, ids are `[a-z][a-z0-9-]{1,23}`, and the
 * optional CSS file must be the same-origin path `/themes/<id>.css`. CSS text is produced only from
 * validated values with fixed templates (no value ever reaches a selector, url() or comment), and
 * `cssFor` refuses to emit anything for a theme with violations. No DOM access, no network.
 */

export const TOKEN_NAMES = [
  'bg',
  'surface',
  'text',
  'text-muted',
  'primary',
  'primary-text',
  'border',
  'danger',
  'success',
  'link',
  'focus-ring',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export type ContrastLevel = 'AA' | 'AAA';

export interface ThemeDef {
  readonly id: string;
  readonly label: string;
  readonly scheme: 'light' | 'dark';
  /** Text contrast level the theme promises (AAA => 7:1 for text pairs). */
  readonly level: ContrastLevel;
  /** `none`: no animation or transition at all. `reduced-aware`: any motion is off under prefers-reduced-motion. */
  readonly motion: 'none' | 'reduced-aware';
  readonly tokens: Readonly<Record<TokenName, string>>;
  /** Same-origin static stylesheet, loaded only when the theme is selected. Must equal `/themes/<id>.css`. */
  readonly cssFile?: string;
}

export type ViolationCode =
  | 'NOT_OBJECT'
  | 'BAD_ID'
  | 'BAD_LABEL'
  | 'BAD_SCHEME'
  | 'BAD_LEVEL'
  | 'BAD_MOTION'
  | 'BAD_CSS_FILE'
  | 'UNKNOWN_TOKEN'
  | 'MISSING_TOKEN'
  | 'BAD_COLOR'
  | 'LOW_CONTRAST';

export interface Violation {
  readonly code: ViolationCode;
  /** Static location such as `tokens.text` (token names come from the closed set, never from input). */
  readonly path: string;
  /** Contrast ratio for LOW_CONTRAST. */
  readonly ratio?: number;
  readonly required?: number;
}

const ID_RE = /^[a-z][a-z0-9-]{1,23}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

// ---------------------------------------------------------------------------------------------
// WCAG 2.x

/** Parses `#rrggbb` to 0..255 channels; undefined if malformed. */
export function parseHex(hex: string): readonly [number, number, number] | undefined {
  if (typeof hex !== 'string' || !COLOR_RE.test(hex)) return undefined;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio in [1, 21], unrounded. Throws RangeError on malformed colours. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (ca === undefined || cb === undefined) throw new RangeError('colour must be #rrggbb');
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface PairRule {
  readonly fg: TokenName;
  readonly bg: TokenName;
  /** text pairs need 4.5 (AA) / 7 (AAA); non-text UI parts need 3 (WCAG 1.4.11). */
  readonly kind: 'text' | 'ui';
}

export const CONTRAST_RULES: readonly PairRule[] = [
  { fg: 'text', bg: 'bg', kind: 'text' },
  { fg: 'text', bg: 'surface', kind: 'text' },
  { fg: 'text-muted', bg: 'bg', kind: 'text' },
  { fg: 'text-muted', bg: 'surface', kind: 'text' },
  { fg: 'primary-text', bg: 'primary', kind: 'text' },
  { fg: 'link', bg: 'bg', kind: 'text' },
  { fg: 'link', bg: 'surface', kind: 'text' },
  { fg: 'danger', bg: 'bg', kind: 'text' },
  { fg: 'danger', bg: 'surface', kind: 'text' },
  { fg: 'success', bg: 'bg', kind: 'text' },
  { fg: 'success', bg: 'surface', kind: 'text' },
  { fg: 'border', bg: 'bg', kind: 'ui' },
  { fg: 'focus-ring', bg: 'bg', kind: 'ui' },
  { fg: 'focus-ring', bg: 'surface', kind: 'ui' },
  { fg: 'primary', bg: 'bg', kind: 'ui' },
];

export interface ContrastRow {
  readonly fg: TokenName;
  readonly bg: TokenName;
  readonly ratio: number;
  readonly required: number;
  readonly pass: boolean;
}

/** Full contrast table for a theme whose colour tokens are all valid; skips pairs with invalid colours. */
export function contrastReport(
  tokens: Readonly<Partial<Record<TokenName, string>>>,
  level: ContrastLevel,
): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const r of CONTRAST_RULES) {
    const f = tokens[r.fg];
    const b = tokens[r.bg];
    if (f === undefined || b === undefined || parseHex(f) === undefined || parseHex(b) === undefined)
      continue;
    const required = r.kind === 'ui' ? 3 : level === 'AAA' ? 7 : 4.5;
    const ratio = contrastRatio(f, b);
    rows.push({ fg: r.fg, bg: r.bg, ratio, required, pass: ratio >= required });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Validation

/** Validates an untrusted theme definition. Empty array means valid. Never throws. */
export function validateTheme(t: unknown): Violation[] {
  const out: Violation[] = [];
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return [{ code: 'NOT_OBJECT', path: '' }];
  const o = t as Record<string, unknown>;
  const get = (k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
  const id = get('id');
  if (typeof id !== 'string' || !ID_RE.test(id)) out.push({ code: 'BAD_ID', path: 'id' });
  const label = get('label');
  if (typeof label !== 'string' || !LABEL_RE.test(label)) out.push({ code: 'BAD_LABEL', path: 'label' });
  const scheme = get('scheme');
  if (scheme !== 'light' && scheme !== 'dark') out.push({ code: 'BAD_SCHEME', path: 'scheme' });
  const level = get('level');
  if (level !== 'AA' && level !== 'AAA') out.push({ code: 'BAD_LEVEL', path: 'level' });
  const motion = get('motion');
  if (motion !== 'none' && motion !== 'reduced-aware') out.push({ code: 'BAD_MOTION', path: 'motion' });
  const css = get('cssFile');
  if (css !== undefined && (typeof id !== 'string' || css !== `/themes/${id}.css` || !ID_RE.test(id)))
    out.push({ code: 'BAD_CSS_FILE', path: 'cssFile' });

  const tokens = get('tokens');
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
    out.push({ code: 'MISSING_TOKEN', path: 'tokens' });
    return out;
  }
  const tk = tokens as Record<string, unknown>;
  for (const k of Object.keys(tk))
    if (!(TOKEN_NAMES as readonly string[]).includes(k)) out.push({ code: 'UNKNOWN_TOKEN', path: 'tokens' });
  const valid: Partial<Record<TokenName, string>> = {};
  for (const name of TOKEN_NAMES) {
    const v = Object.hasOwn(tk, name) ? tk[name] : undefined;
    if (v === undefined) out.push({ code: 'MISSING_TOKEN', path: `tokens.${name}` });
    else if (typeof v !== 'string' || !COLOR_RE.test(v))
      out.push({ code: 'BAD_COLOR', path: `tokens.${name}` });
    else valid[name] = v;
  }
  const lv: ContrastLevel = level === 'AAA' ? 'AAA' : 'AA';
  for (const row of contrastReport(valid, lv)) {
    if (!row.pass)
      out.push({
        code: 'LOW_CONTRAST',
        path: `tokens.${row.fg}/${row.bg}`,
        ratio: Math.floor(row.ratio * 100) / 100,
        required: row.required,
      });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Output

/** CSS custom-property name for a token, e.g. `--gp-text-muted`. */
export function cssVarName(token: TokenName): string {
  return `--gp-${token}`;
}

export type CssResult =
  | { readonly ok: true; readonly css: string; readonly vars: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly violations: readonly Violation[] };

/**
 * Builds `:root[data-theme="<id>"]{--gp-…:#rrggbb;…}` for a valid theme, plus the same variables as a
 * map for `style.setProperty`. Colours are lower-cased. Invalid themes yield `ok: false` and no CSS.
 */
export function cssFor(theme: unknown): CssResult {
  const violations = validateTheme(theme);
  if (violations.length > 0) return { ok: false, violations };
  const t = theme as ThemeDef;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[cssVarName(name)] = t.tokens[name].toLowerCase();
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return { ok: true, css: `:root[data-theme="${t.id}"]{color-scheme:${t.scheme};${body}}`, vars };
}

/** Parses an untrusted JSON string into a validated theme (e.g. an imported file). */
export function parseThemeJson(
  json: string,
):
  | { readonly ok: true; readonly theme: ThemeDef }
  | { readonly ok: false; readonly violations: readonly Violation[] } {
  let v: unknown;
  if (typeof json !== 'string' || json.length > 4096)
    return { ok: false, violations: [{ code: 'NOT_OBJECT', path: '' }] };
  try {
    v = JSON.parse(json);
  } catch {
    return { ok: false, violations: [{ code: 'NOT_OBJECT', path: '' }] };
  }
  const violations = validateTheme(v);
  if (violations.length > 0) return { ok: false, violations };
  const o = v as ThemeDef;
  const tokens = Object.fromEntries(TOKEN_NAMES.map((n) => [n, o.tokens[n].toLowerCase()])) as Record<
    TokenName,
    string
  >;
  const base = { id: o.id, label: o.label, scheme: o.scheme, level: o.level, motion: o.motion, tokens };
  return { ok: true, theme: o.cssFile === undefined ? base : { ...base, cssFile: o.cssFile } };
}

// ---------------------------------------------------------------------------------------------
// Registry

const t = (tokens: Record<TokenName, string>): Record<TokenName, string> => tokens;

export const THEMES: readonly ThemeDef[] = Object.freeze([
  {
    id: 'light',
    label: 'Light',
    scheme: 'light',
    level: 'AA',
    motion: 'reduced-aware',
    tokens: t({
      bg: '#ffffff',
      surface: '#f4f6f8',
      text: '#111827',
      'text-muted': '#4b5563',
      primary: '#1d4ed8',
      'primary-text': '#ffffff',
      border: '#6b7280',
      danger: '#b91c1c',
      success: '#166534',
      link: '#1d4ed8',
      'focus-ring': '#1d4ed8',
    }),
  },
  {
    id: 'dark',
    label: 'Dark',
    scheme: 'dark',
    level: 'AA',
    motion: 'reduced-aware',
    tokens: t({
      bg: '#0b0f14',
      surface: '#151b23',
      text: '#e6edf3',
      'text-muted': '#9aa7b4',
      primary: '#60a5fa',
      'primary-text': '#0b0f14',
      border: '#6e7b89',
      danger: '#f87171',
      success: '#4ade80',
      link: '#7cb7ff',
      'focus-ring': '#93c5fd',
    }),
  },
  {
    id: 'high-contrast',
    label: 'High contrast',
    scheme: 'dark',
    level: 'AAA',
    motion: 'none',
    tokens: t({
      bg: '#000000',
      surface: '#0a0a0a',
      text: '#ffffff',
      'text-muted': '#e0e0e0',
      primary: '#ffff00',
      'primary-text': '#000000',
      border: '#ffffff',
      danger: '#ff9a9a',
      success: '#7dff9a',
      link: '#8ecbff',
      'focus-ring': '#ffff00',
    }),
  },
  {
    id: 'cypher',
    label: 'Cypher',
    scheme: 'dark',
    level: 'AA',
    motion: 'none',
    cssFile: '/themes/cypher.css',
    tokens: t({
      bg: '#05070a',
      surface: '#0a1118',
      text: '#d7fff1',
      'text-muted': '#8fc9b5',
      primary: '#00ffc8',
      'primary-text': '#00110c',
      border: '#1f8f74',
      danger: '#ff6b8b',
      success: '#39ff88',
      link: '#4df3ff',
      'focus-ring': '#00ffc8',
    }),
  },
]);

export type ThemeId = 'system' | 'light' | 'dark' | 'high-contrast' | 'cypher';
export const THEME_IDS: readonly ThemeId[] = Object.freeze(['system', ...THEMES.map((x) => x.id as ThemeId)]);

/** Settings sanitiser (THEME-1): anything not in the registry becomes `system`. */
export function themeAttr(id: unknown): ThemeId {
  return typeof id === 'string' && (THEME_IDS as readonly string[]).includes(id) ? (id as ThemeId) : 'system';
}

/** Definition for a registered id; undefined for `system` and unknown ids. */
export function themeById(id: unknown): ThemeDef | undefined {
  return typeof id === 'string' ? THEMES.find((x) => x.id === id) : undefined;
}

/** The only stylesheet href the app may append for a theme (THEME-4), or undefined. */
export function themeCssHref(id: unknown): string | undefined {
  return themeById(id)?.cssFile;
}

/** True if `href` is a safe same-origin theme path (no scheme, host, traversal, query or fragment). */
export function isSameOriginThemeHref(href: unknown): boolean {
  return typeof href === 'string' && /^\/themes\/[a-z][a-z0-9-]{1,23}\.css$/.test(href);
}
