import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_RULES,
  THEMES,
  THEME_IDS,
  TOKEN_NAMES,
  contrastRatio,
  contrastReport,
  cssFor,
  cssVarName,
  isSameOriginThemeHref,
  parseHex,
  parseThemeJson,
  relativeLuminance,
  themeAttr,
  themeById,
  themeCssHref,
  validateTheme,
  type ThemeDef,
} from './theme.js';

const cypher = THEMES.find((t) => t.id === 'cypher') as ThemeDef;
const light = THEMES.find((t) => t.id === 'light') as ThemeDef;
const clone = (
  t: ThemeDef,
  patch: Record<string, unknown> = {},
  tokens: Record<string, unknown> = {},
): unknown => ({ ...t, ...patch, tokens: { ...t.tokens, ...tokens } });
const codes = (t: unknown): string[] => validateTheme(t).map((v) => v.code);

describe('WCAG math', () => {
  it('known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.478, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.542, 2);
    expect(contrastRatio('#ffffff', '#000000')).toBe(contrastRatio('#000000', '#ffffff'));
  });
  it('luminance extremes and low-channel branch', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(relativeLuminance([5, 5, 5])).toBeCloseTo(5 / 255 / 12.92, 10);
  });
  it('parseHex strictness; contrastRatio throws on junk', () => {
    expect(parseHex('#0a0B0c')).toEqual([10, 11, 12]);
    for (const bad of ['#fff', '000000', '#00000g', 'red', '#000000;', '#0000000', 5 as unknown as string])
      expect(parseHex(bad)).toBeUndefined();
    expect(() => contrastRatio('red', '#000000')).toThrow(RangeError);
    expect(() => contrastRatio('#000000', 'red')).toThrow(RangeError);
  });
  it('property: ratio in [1,21] and symmetric', () => {
    const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => '#' + n.toString(16).padStart(6, '0'));
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        const r = contrastRatio(a, b);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21.0000001);
        expect(r).toBe(contrastRatio(b, a));
      }),
    );
  });
});

describe('built-in themes (THEME-2, T-2)', () => {
  it('every theme validates with zero violations', () => {
    for (const t of THEMES) expect(validateTheme(t)).toEqual([]);
  });
  it('contrast report covers every rule and AAA theme meets 7:1 on text', () => {
    for (const t of THEMES) {
      const rows = contrastReport(t.tokens, t.level);
      expect(rows).toHaveLength(CONTRAST_RULES.length);
      expect(rows.every((r) => r.pass)).toBe(true);
    }
    const hc = THEMES.find((t) => t.id === 'high-contrast') as ThemeDef;
    expect(contrastRatio(hc.tokens.text, hc.tokens.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(hc.tokens['text-muted'], hc.tokens.surface)).toBeGreaterThanOrEqual(7);
  });
  it('cypher is animation-free and loads only /themes/cypher.css', () => {
    expect(cypher.motion).toBe('none');
    expect(themeCssHref('cypher')).toBe('/themes/cypher.css');
    expect(themeCssHref('dark')).toBeUndefined();
    expect(themeCssHref('evil')).toBeUndefined();
    expect(THEMES.filter((t) => t.cssFile !== undefined).map((t) => t.id)).toEqual(['cypher']);
  });
  it('registry ids are unique and frozen', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(Object.isFrozen(THEMES)).toBe(true);
    expect(THEME_IDS[0]).toBe('system');
  });
});

describe('themeAttr (THEME-1, T-1)', () => {
  it('falls back to system', () => {
    for (const bad of [
      'evil',
      '',
      'LIGHT',
      'light ',
      '__proto__',
      'constructor',
      5,
      null,
      undefined,
      {},
      ['dark'],
    ])
      expect(themeAttr(bad)).toBe('system');
    for (const id of THEME_IDS) expect(themeAttr(id)).toBe(id);
  });
  it('themeById', () => {
    expect(themeById('dark')?.id).toBe('dark');
    expect(themeById('system')).toBeUndefined();
    expect(themeById(3)).toBeUndefined();
    expect(themeById('toString')).toBeUndefined();
  });
});

describe('validateTheme rejects bad input', () => {
  it('non-objects', () => {
    for (const v of [null, undefined, 5, 'x', []]) expect(codes(v)).toEqual(['NOT_OBJECT']);
  });
  it('field checks', () => {
    expect(codes(clone(light, { id: 'Bad' }))).toContain('BAD_ID');
    expect(codes(clone(light, { id: 'a"]{}' }))).toContain('BAD_ID');
    expect(codes(clone(light, { label: '<img onerror=x>' }))).toContain('BAD_LABEL');
    expect(codes(clone(light, { label: 'x'.repeat(41) }))).toContain('BAD_LABEL');
    expect(codes(clone(light, { scheme: 'sepia' }))).toContain('BAD_SCHEME');
    expect(codes(clone(light, { level: 'A' }))).toContain('BAD_LEVEL');
    expect(codes(clone(light, { motion: 'wild' }))).toContain('BAD_MOTION');
    expect(codes({ ...light, tokens: undefined })).toContain('MISSING_TOKEN');
    expect(codes({ ...light, tokens: [] })).toContain('MISSING_TOKEN');
  });
  it('cssFile must be exactly /themes/<id>.css', () => {
    for (const bad of [
      'https://evil.example/x.css',
      '//evil.example/x.css',
      '/themes/../x.css',
      '/themes/other.css',
      'themes/light.css',
      '/themes/light.css?x=1',
      '/themes/light.css#a',
      '\\themes\\light.css',
      5,
    ]) {
      expect(codes(clone(light, { cssFile: bad }))).toContain('BAD_CSS_FILE');
    }
    expect(codes(clone(light, { cssFile: '/themes/light.css' }))).toEqual([]);
    expect(codes({ ...light, id: 5, cssFile: '/themes/light.css' })).toContain('BAD_CSS_FILE');
  });
  it('token checks: injection payloads, unknown, missing', () => {
    const payloads = [
      'red',
      '#fff',
      'url(https://evil.example/x)',
      '#ffffff;}body{display:none',
      '#ffffff\n',
      'expression(1)',
      '#ffffff /*',
      '@import "x"',
      5,
      null,
      {},
    ];
    for (const p of payloads) expect(codes(clone(light, {}, { text: p }))).toContain('BAD_COLOR');
    expect(codes(clone(light, {}, { 'x}body{a': '#000000' }))).toContain('UNKNOWN_TOKEN');
    expect(codes(clone(light, {}, { __proto__x: '#000000' }))).toContain('UNKNOWN_TOKEN');
    const { text: _omit, ...rest } = light.tokens;
    void _omit;
    expect(
      validateTheme({ ...light, tokens: rest }).some(
        (v) => v.code === 'MISSING_TOKEN' && v.path === 'tokens.text',
      ),
    ).toBe(true);
  });
  it('prototype-inherited fields are ignored', () => {
    const inherited = Object.create(light) as unknown;
    expect(codes(inherited)).toContain('BAD_ID');
  });
  it('low contrast is reported with ratios', () => {
    const v = validateTheme(clone(light, {}, { text: '#777777' }));
    const lc = v.filter((x) => x.code === 'LOW_CONTRAST');
    expect(lc.length).toBeGreaterThan(0);
    expect(lc[0]).toMatchObject({ required: 4.5 });
    expect(lc[0]?.ratio).toBeLessThan(4.5);
    expect(v.every((x) => !JSON.stringify(x).includes('777777'))).toBe(true);
  });
  it('boundary: 4.5 passes, just below fails (unrounded)', () => {
    // find a grey that passes vs the next lighter one on white
    expect(codes(clone(light, {}, { surface: '#ffffff', 'text-muted': '#767676', text: '#767676' }))).toEqual(
      [],
    );
    expect(codes(clone(light, {}, { surface: '#ffffff', 'text-muted': '#777777' }))).toContain(
      'LOW_CONTRAST',
    );
  });
  it('AAA level demands 7:1; ui parts need 3:1', () => {
    expect(codes(clone(light, { level: 'AAA' }))).toContain('LOW_CONTRAST');
    expect(codes(clone(light, {}, { border: '#d1d5db' }))).toContain('LOW_CONTRAST');
    expect(codes(clone(light, {}, { 'focus-ring': '#ffffff' }))).toContain('LOW_CONTRAST');
  });
});

describe('cssFor (injection-proof output)', () => {
  it('emits fixed-template CSS for valid themes', () => {
    const r = cssFor(cypher);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.css.startsWith(':root[data-theme="cypher"]{color-scheme:dark;--gp-bg:#05070a;')).toBe(true);
    expect(r.css.endsWith(';}')).toBe(true);
    expect(Object.keys(r.vars)).toHaveLength(TOKEN_NAMES.length);
    expect(r.vars['--gp-text-muted']).toBe('#8fc9b5');
    expect(cssVarName('focus-ring')).toBe('--gp-focus-ring');
    expect(r.css.match(/\{/g)).toHaveLength(1);
    expect(r.css.match(/\}/g)).toHaveLength(1);
  });
  it('upper-case hex is lower-cased', () => {
    const r = cssFor(clone(light, {}, { bg: '#FFFFFF' }));
    expect(r.ok && r.vars['--gp-bg']).toBe('#ffffff');
  });
  it('refuses any theme with violations, emitting no CSS', () => {
    const r = cssFor(clone(light, {}, { bg: '#ffffff;}*{display:none' }));
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain('display');
    expect(cssFor(null)).toMatchObject({ ok: false });
  });
  it('property: for arbitrary token strings output is either refused or contains only safe characters', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.string({ unit: 'binary' }), (id, color) => {
        const r = cssFor({ ...light, id, tokens: { ...light.tokens, link: color } });
        if (r.ok)
          expect(r.css).toMatch(
            /^:root\[data-theme="[a-z0-9-]+"\]\{color-scheme:(light|dark);(--gp-[a-z-]+:#[0-9a-f]{6};)+\}$/,
          );
      }),
      { numRuns: 500 },
    );
  });
});

describe('parseThemeJson', () => {
  it('accepts a valid imported theme and normalises it', () => {
    const json = JSON.stringify({ ...light, id: 'mine', tokens: { ...light.tokens, bg: '#FFFFFF' } });
    const r = parseThemeJson(json);
    expect(r.ok && r.theme.tokens.bg).toBe('#ffffff');
    const withCss = parseThemeJson(JSON.stringify({ ...cypher }));
    expect(withCss.ok && withCss.theme.cssFile).toBe('/themes/cypher.css');
  });
  it('rejects junk, oversize, invalid and strips unknown top-level fields', () => {
    expect(parseThemeJson('{').ok).toBe(false);
    expect(parseThemeJson('x'.repeat(5000)).ok).toBe(false);
    expect(parseThemeJson(5 as unknown as string).ok).toBe(false);
    expect(parseThemeJson('[]').ok).toBe(false);
    const r = parseThemeJson(JSON.stringify({ ...light, extra: '<script>' }));
    expect(r.ok && JSON.stringify(r.theme)).not.toContain('script');
  });
});

describe('isSameOriginThemeHref', () => {
  it('accepts only /themes/<id>.css', () => {
    expect(isSameOriginThemeHref('/themes/cypher.css')).toBe(true);
    for (const bad of [
      'http://x/themes/a.css',
      '//x/themes/ab.css',
      '/themes/../ab.css',
      '/themes/ab.css?x',
      '/themes/AB.css',
      '/themes/ab.js',
      5,
      undefined,
      '/themes/a.css',
    ])
      expect(isSameOriginThemeHref(bad)).toBe(false);
  });
});
