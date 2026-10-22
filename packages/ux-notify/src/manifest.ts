import { isRecord } from './common.js';
import { hasSensitiveQuery } from './urlsafety.js';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface ManifestShortcut {
  name: string;
  url: string;
}

/** Web app manifest subset we emit. No related_applications / share_target / handlers. */
export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  scope: string;
  display: 'standalone' | 'minimal-ui' | 'fullscreen' | 'browser';
  orientation?: 'any' | 'portrait' | 'landscape';
  background_color: string;
  theme_color: string;
  lang: string;
  dir: 'ltr' | 'rtl' | 'auto';
  icons: ManifestIcon[];
  categories?: string[];
  shortcuts?: ManifestShortcut[];
}

export interface ManifestIssue {
  severity: 'error' | 'warning';
  path: string;
  code: string;
}

export interface ManifestOptions {
  name: string;
  shortName: string;
  startUrl?: string;
  scope?: string;
  id?: string;
  description?: string;
  display?: WebManifest['display'];
  themeColor: string;
  backgroundColor: string;
  lang?: string;
  dir?: WebManifest['dir'];
  icons: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
  /**
   * Neutral home-screen identity. When set, replaces name/short_name/description
   * so the installed icon does not reveal a payments app to a bystander.
   */
  discreetIdentity?: { name: string; shortName: string };
}

const FORBIDDEN = [
  'related_applications',
  'prefer_related_applications',
  'share_target',
  'protocol_handlers',
  'file_handlers',
  'url_handlers',
  'launch_handler',
  'edge_side_panel',
];
const KNOWN = [
  'id',
  'name',
  'short_name',
  'description',
  'start_url',
  'scope',
  'display',
  'orientation',
  'background_color',
  'theme_color',
  'lang',
  'dir',
  'icons',
  'categories',
  'shortcuts',
];
const DISPLAYS = ['standalone', 'minimal-ui', 'fullscreen', 'browser'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ICON_TYPES: Record<string, string> = { png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };

/** Path-absolute, same-origin, no traversal/scheme/fragment/secret-bearing query. */
function pathIssue(v: unknown): string | null {
  if (typeof v !== 'string' || v === '' || v.length > 512) return 'invalid_url';
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || v.includes('#'))
    return 'not_same_origin_path';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(v)) return 'invalid_url';
  const qi = v.indexOf('?');
  const path = qi === -1 ? v : v.slice(0, qi);
  if (path.split('/').some((s) => s === '..' || s === '.') || /%2e|%2f|%5c/i.test(path))
    return 'path_traversal';
  if (qi !== -1 && hasSensitiveQuery(v.slice(qi))) return 'sensitive_query';
  return null;
}

function inScope(url: string, scope: string): boolean {
  const p = url.split('?')[0] ?? url;
  const s = scope.endsWith('/') ? scope : scope + '/';
  return p === scope || p.startsWith(s);
}

/** Validate an untrusted manifest object. Never throws. */
export function validateManifest(input: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const err = (path: string, code: string): void => void issues.push({ severity: 'error', path, code });
  const warn = (path: string, code: string): void => void issues.push({ severity: 'warning', path, code });
  if (!isRecord(input)) return [{ severity: 'error', path: '', code: 'not_object' }];

  for (const k of Object.keys(input)) {
    if (FORBIDDEN.includes(k)) err(k, 'privacy_forbidden_member');
    else if (!KNOWN.includes(k)) warn(k, 'unknown_member');
  }
  const name = input['name'];
  if (typeof name !== 'string' || name.trim() === '' || name.length > 45) err('name', 'invalid_name');
  const sn = input['short_name'];
  if (typeof sn !== 'string' || sn.trim() === '' || sn.length > 12) err('short_name', 'invalid_short_name');
  const desc = input['description'];
  if (desc !== undefined && (typeof desc !== 'string' || desc.length > 300))
    err('description', 'invalid_description');

  for (const f of ['start_url', 'scope', 'id'] as const) {
    const code = pathIssue(input[f]);
    if (code) err(f, code);
  }
  const su = input['start_url'],
    sc = input['scope'];
  if (
    typeof su === 'string' &&
    typeof sc === 'string' &&
    pathIssue(su) === null &&
    pathIssue(sc) === null &&
    !inScope(su, sc)
  ) {
    err('start_url', 'start_url_outside_scope');
  }

  if (typeof input['display'] !== 'string' || !DISPLAYS.includes(input['display']))
    err('display', 'invalid_display');
  else if (input['display'] === 'browser') warn('display', 'not_installable_display');
  const or = input['orientation'];
  if (or !== undefined && or !== 'any' && or !== 'portrait' && or !== 'landscape')
    err('orientation', 'invalid_orientation');
  for (const f of ['background_color', 'theme_color']) {
    const c = input[f];
    if (typeof c !== 'string' || !HEX.test(c)) err(f, 'invalid_color');
  }
  const lang = input['lang'];
  if (typeof lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) err('lang', 'invalid_lang');
  const dir = input['dir'];
  if (dir !== 'ltr' && dir !== 'rtl' && dir !== 'auto') err('dir', 'invalid_dir');

  const cats = input['categories'];
  if (
    cats !== undefined &&
    (!Array.isArray(cats) ||
      cats.length > 10 ||
      !cats.every((c) => typeof c === 'string' && /^[a-z]{2,24}$/.test(c)))
  )
    err('categories', 'invalid_categories');

  checkIcons(input['icons'], err, warn);

  const sh = input['shortcuts'];
  if (sh !== undefined) {
    if (!Array.isArray(sh) || sh.length > 4) err('shortcuts', 'invalid_shortcuts');
    else {
      (sh as unknown[]).forEach((s, i) => {
        const p = `shortcuts[${i}]`;
        if (!isRecord(s) || typeof s['name'] !== 'string' || s['name'] === '' || s['name'].length > 45)
          return err(p, 'invalid_shortcut');
        const code = pathIssue(s['url']);
        if (code) return err(`${p}.url`, code);
        if (typeof sc === 'string' && pathIssue(sc) === null && !inScope(s['url'] as string, sc))
          err(`${p}.url`, 'shortcut_outside_scope');
      });
    }
  }
  return issues;
}

function checkIcons(
  icons: unknown,
  err: (p: string, c: string) => void,
  warn: (p: string, c: string) => void,
): void {
  if (!Array.isArray(icons) || icons.length < 1 || icons.length > 12) return err('icons', 'invalid_icons');
  let has192 = false,
    has512 = false,
    maskable = false;
  (icons as unknown[]).forEach((ic, i) => {
    const p = `icons[${i}]`;
    if (!isRecord(ic)) return err(p, 'invalid_icon');
    const code = pathIssue(ic['src']);
    if (code) return err(`${p}.src`, code);
    const src = (ic['src'] as string).split('?')[0] as string;
    const ext = src.slice(src.lastIndexOf('.') + 1).toLowerCase();
    const mime = ICON_TYPES[ext];
    if (mime === undefined) return err(`${p}.src`, 'icon_extension');
    if (ic['type'] !== mime) return err(`${p}.type`, 'icon_type_mismatch');
    const sizes = ic['sizes'];
    const m = typeof sizes === 'string' ? /^(\d{2,4})x(\d{2,4})$/.exec(sizes) : null;
    if (!(sizes === 'any' && ext === 'svg') && (!m || m[1] !== m[2])) return err(`${p}.sizes`, 'icon_sizes');
    const purposes =
      ic['purpose'] === undefined
        ? ['any']
        : typeof ic['purpose'] === 'string'
          ? ic['purpose'].split(' ')
          : [];
    if (
      purposes.length === 0 ||
      !purposes.every((x) => x === 'any' || x === 'maskable' || x === 'monochrome')
    )
      return err(`${p}.purpose`, 'icon_purpose');
    const px = m ? Number(m[1]) : 0;
    if (purposes.includes('maskable')) maskable = true;
    if (purposes.includes('any') && ext === 'png') {
      if (px >= 192) has192 = true;
      if (px >= 512) has512 = true;
    }
  });
  if (!has192 || !has512) err('icons', 'missing_required_icon_sizes');
  if (!maskable) warn('icons', 'no_maskable_icon');
}

export type GenerateResult =
  { ok: true; manifest: WebManifest; warnings: ManifestIssue[] } | { ok: false; issues: ManifestIssue[] };

/** Build a manifest and validate it; refuses to return an invalid one. */
export function generateManifest(o: ManifestOptions): GenerateResult {
  const startUrl = o.startUrl ?? '/';
  const manifest: WebManifest = {
    id: o.id ?? startUrl,
    name: o.discreetIdentity?.name ?? o.name,
    short_name: o.discreetIdentity?.shortName ?? o.shortName,
    start_url: startUrl,
    scope: o.scope ?? '/',
    display: o.display ?? 'standalone',
    background_color: o.backgroundColor,
    theme_color: o.themeColor,
    lang: o.lang ?? 'en',
    dir: o.dir ?? 'auto',
    icons: o.icons.map((i) => ({ ...i })),
  };
  if (o.description !== undefined && o.discreetIdentity === undefined) manifest.description = o.description;
  if (o.shortcuts) manifest.shortcuts = o.shortcuts.map((s) => ({ ...s }));
  const issues = validateManifest(manifest);
  return issues.some((i) => i.severity === 'error')
    ? { ok: false, issues }
    : { ok: true, manifest, warnings: issues };
}
