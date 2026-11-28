import { describe, expect, it } from 'vitest';
import { cssFor, THEMES } from './theme.js';

const light = THEMES.find((theme) => theme.id === 'light');
if (light === undefined) throw new Error('missing light theme fixture');

describe('theme CSS snapshot safety', () => {
  it('uses the colour that passed validation instead of rereading a changing getter', () => {
    const tokens = { ...light.tokens };
    let reads = 0;
    Object.defineProperty(tokens, 'bg', {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? '#ffffff' : '#ffffff;}body{display:none;/*';
      },
    });

    const result = cssFor({ ...light, tokens });
    expect(reads).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vars['--gp-bg']).toBe('#ffffff');
    expect(result.css).not.toContain('body{');
  });

  it('uses the validated selector id rather than a changing id getter', () => {
    const theme = { ...light };
    let reads = 0;
    Object.defineProperty(theme, 'id', {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 'light' : 'light"]{color:red}body{';
      },
    });

    const result = cssFor(theme);
    expect(reads).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.css).toContain(':root[data-theme="light"]');
    expect(result.css).not.toContain('body{');
  });

  it('fails closed when an untrusted getter throws', () => {
    const tokens = { ...light.tokens };
    Object.defineProperty(tokens, 'bg', {
      enumerable: true,
      get: () => {
        throw new Error('untrusted getter exception');
      },
    });
    expect(() => cssFor({ ...light, tokens })).not.toThrow();
    expect(cssFor({ ...light, tokens })).toMatchObject({ ok: false });
  });

  it('preserves built-in theme CSS output for ordinary data objects', () => {
    const result = cssFor(light);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.css).toContain(':root[data-theme="light"]{color-scheme:light;');
    expect(result.vars['--gp-bg']).toBe(light.tokens.bg);
  });
});
