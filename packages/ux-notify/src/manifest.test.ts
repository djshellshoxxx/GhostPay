import { describe, expect, it } from 'vitest';
import { generateManifest, validateManifest, type ManifestOptions } from './manifest.js';

const icons = [
  { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/mask.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];
const opts: ManifestOptions = {
  name: 'Example Wallet',
  shortName: 'Wallet',
  themeColor: '#112233',
  backgroundColor: '#fff',
  icons,
};
const codes = (m: unknown, sev?: 'error' | 'warning') =>
  validateManifest(m)
    .filter((i) => !sev || i.severity === sev)
    .map((i) => `${i.path}:${i.code}`);

function good() {
  const r = generateManifest(opts);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return JSON.parse(JSON.stringify(r.manifest)) as Record<string, unknown>;
}

describe('generateManifest', () => {
  it('produces a valid default manifest', () => {
    const r = generateManifest({
      ...opts,
      description: 'Local wallet',
      shortcuts: [{ name: 'Send', url: '/send' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest).toMatchObject({
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        lang: 'en',
        dir: 'auto',
        description: 'Local wallet',
      });
      expect(r.warnings).toEqual([]);
    }
  });
  it('discreet identity replaces name and drops description', () => {
    const r = generateManifest({
      ...opts,
      description: 'Pay stuff',
      discreetIdentity: { name: 'Notes', shortName: 'Notes' },
    });
    expect(r.ok && r.manifest.name).toBe('Notes');
    expect(r.ok && r.manifest.description).toBeUndefined();
  });
  it('refuses invalid output and warns without maskable', () => {
    const bad = generateManifest({ ...opts, startUrl: 'https://evil.example/' });
    expect(bad.ok).toBe(false);
    const w = generateManifest({ ...opts, icons: icons.slice(0, 2) });
    expect(w.ok && w.warnings.map((x) => x.code)).toEqual(['no_maskable_icon']);
  });
});

describe('validateManifest', () => {
  it('rejects non-objects', () => {
    for (const v of [null, 5, [], 'x']) expect(codes(v)).toEqual([':not_object']);
  });
  it('flags forbidden privacy members and warns on unknown', () => {
    const m = { ...good(), share_target: { action: '/s' }, related_applications: [], zzz: 1 };
    expect(codes(m)).toEqual(
      expect.arrayContaining([
        'share_target:privacy_forbidden_member',
        'related_applications:privacy_forbidden_member',
        'zzz:unknown_member',
      ]),
    );
  });
  it('validates names', () => {
    expect(codes({ ...good(), name: '' }, 'error')).toContain('name:invalid_name');
    expect(codes({ ...good(), name: 'x'.repeat(46) }, 'error')).toContain('name:invalid_name');
    expect(codes({ ...good(), short_name: 'x'.repeat(13) }, 'error')).toContain(
      'short_name:invalid_short_name',
    );
    expect(codes({ ...good(), short_name: 5 }, 'error')).toContain('short_name:invalid_short_name');
    expect(codes({ ...good(), description: 5 }, 'error')).toContain('description:invalid_description');
  });
  it.each([
    ['https://evil.example/', 'not_same_origin_path'],
    ['//evil.example', 'not_same_origin_path'],
    ['relative', 'not_same_origin_path'],
    ['/a\\b', 'not_same_origin_path'],
    ['/a#frag', 'not_same_origin_path'],
    ['/a b', 'invalid_url'],
    ['', 'invalid_url'],
    ['/' + 'a'.repeat(600), 'invalid_url'],
    ['/a/../b', 'path_traversal'],
    ['/a/%2e%2e/b', 'path_traversal'],
    ['/a/./b', 'path_traversal'],
    ['/?token=abc', 'sensitive_query'],
  ])('start_url %j -> %s', (u, code) => {
    expect(codes({ ...good(), start_url: u }, 'error')).toContain(`start_url:${code}`);
  });
  it('scope rules', () => {
    expect(codes({ ...good(), start_url: '/x', scope: '/app' }, 'error')).toContain(
      'start_url:start_url_outside_scope',
    );
    expect(codes({ ...good(), start_url: '/app/x?a=1', scope: '/app' }, 'error')).toEqual([]);
    expect(codes({ ...good(), start_url: '/app', scope: '/app' }, 'error')).toEqual([]);
    expect(codes({ ...good(), start_url: '/apple', scope: '/app', id: '/app' }, 'error')).toContain(
      'start_url:start_url_outside_scope',
    );
    expect(codes({ ...good(), scope: 5 }, 'error')).toContain('scope:invalid_url');
    expect(codes({ ...good(), id: undefined }, 'error')).toContain('id:invalid_url');
  });
  it('display, orientation, colors, lang, dir, categories', () => {
    expect(codes({ ...good(), display: 'browser' }, 'warning')).toContain('display:not_installable_display');
    expect(codes({ ...good(), display: 'weird' }, 'error')).toContain('display:invalid_display');
    expect(codes({ ...good(), orientation: 'diag' }, 'error')).toContain('orientation:invalid_orientation');
    expect(codes({ ...good(), orientation: 'portrait' }, 'error')).toEqual([]);
    expect(codes({ ...good(), theme_color: 'red' }, 'error')).toContain('theme_color:invalid_color');
    expect(codes({ ...good(), background_color: '#12345' }, 'error')).toContain(
      'background_color:invalid_color',
    );
    expect(codes({ ...good(), lang: 'EN_us' }, 'error')).toContain('lang:invalid_lang');
    expect(codes({ ...good(), dir: 'up' }, 'error')).toContain('dir:invalid_dir');
    expect(codes({ ...good(), categories: ['finance'] }, 'error')).toEqual([]);
    expect(codes({ ...good(), categories: ['Fin ance'] }, 'error')).toContain(
      'categories:invalid_categories',
    );
    expect(codes({ ...good(), categories: 'x' }, 'error')).toContain('categories:invalid_categories');
  });
  it('icons', () => {
    const e = (icons_: unknown) => codes({ ...good(), icons: icons_ }, 'error');
    expect(e('x')).toEqual(['icons:invalid_icons']);
    expect(e([])).toEqual(['icons:invalid_icons']);
    expect(e([5])).toContain('icons[0]:invalid_icon');
    expect(e([{ ...icons[0], src: 'http://x/a.png' }])).toContain('icons[0].src:not_same_origin_path');
    expect(e([{ ...icons[0], src: '/a.gif', type: 'image/gif' }])).toContain('icons[0].src:icon_extension');
    expect(e([{ ...icons[0], type: 'image/webp' }])).toContain('icons[0].type:icon_type_mismatch');
    expect(e([{ ...icons[0], sizes: '192x96' }])).toContain('icons[0].sizes:icon_sizes');
    expect(e([{ ...icons[0], sizes: 'any' }])).toContain('icons[0].sizes:icon_sizes');
    expect(e([{ ...icons[0], sizes: 5 }])).toContain('icons[0].sizes:icon_sizes');
    expect(e([{ ...icons[0], purpose: 'bogus' }])).toContain('icons[0].purpose:icon_purpose');
    expect(e([{ ...icons[0], purpose: 5 }])).toContain('icons[0].purpose:icon_purpose');
    expect(e([icons[0]])).toEqual(['icons:missing_required_icon_sizes']);
    expect(
      e([icons[0], { src: '/a.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any monochrome' }]),
    ).toEqual(['icons:missing_required_icon_sizes']);
    expect(e([icons[0], icons[2]])).toEqual(['icons:missing_required_icon_sizes']);
    expect(e(new Array(13).fill(icons[0]))).toEqual(['icons:invalid_icons']);
  });
  it('shortcuts', () => {
    const e = (s: unknown) =>
      codes({ ...good(), scope: '/app/', start_url: '/app/', id: '/app/', shortcuts: s }, 'error');
    expect(e([{ name: 'Go', url: '/app/go' }])).toEqual([]);
    expect(e('x')).toEqual(['shortcuts:invalid_shortcuts']);
    expect(e(new Array(5).fill({ name: 'a', url: '/app/a' }))).toEqual(['shortcuts:invalid_shortcuts']);
    expect(e([5])).toEqual(['shortcuts[0]:invalid_shortcut']);
    expect(e([{ name: '', url: '/app/a' }])).toEqual(['shortcuts[0]:invalid_shortcut']);
    expect(e([{ name: 'a', url: 'https://x.y' }])).toEqual(['shortcuts[0].url:not_same_origin_path']);
    expect(e([{ name: 'a', url: '/other' }])).toEqual(['shortcuts[0].url:shortcut_outside_scope']);
    expect(e([{ name: 'a', url: '/app/a?secret=1' }])).toEqual(['shortcuts[0].url:sensitive_query']);
  });
});
