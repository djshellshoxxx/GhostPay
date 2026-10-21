import { describe, expect, it } from 'vitest';
import { FlowError } from './errors.js';
import { escapeAttr, escapeHtml, makeSnippet, validateEmbedLink } from './embed.js';

const APP = 'https://pay.example.com';
const LINK = `${APP}/#gpi=v1.AbCd-_09`;
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof FlowError ? (e.message === e.code ? e.code : `${e.code}:${e.message}`) : 'NON_FLOW';
  }
  return undefined;
};

// Vectors mirror apps/web/src/embed.test.ts rules (ghostpay-embed-v1.js validLink); script returns null for non-ok.
const VECTORS: [string, string, string][] = [
  [LINK, APP, 'ok'],
  [`${APP}/app/#gpi=v1.x`, APP, 'ok'],
  ['http://localhost:5173/#gpi=v1.x', 'http://localhost:5173', 'ok'],
  ['http://pay.example.com/#gpi=v1.x', APP, 'scheme'],
  ['http://localhost.evil.com/#gpi=v1.x', APP, 'scheme'],
  ['https://evil.example.net/#gpi=v1.x', APP, 'origin'],
  ['https://pay.example.com.evil.net/#gpi=v1.x', APP, 'origin'],
  ['https://pay.example.com:8443/#gpi=v1.x', APP, 'origin'],
  ['https://user:pw@pay.example.com/#gpi=v1.x', APP, 'credentials'],
  ['https://user@pay.example.com/#gpi=v1.x', APP, 'credentials'],
  [`${APP}/`, APP, 'fragment'],
  [`${APP}/#gpi=v2.x`, APP, 'fragment'],
  [`${APP}/#gpi=v1.`, APP, 'fragment'],
  [`${APP}/?gpi=v1.x`, APP, 'fragment'],
  ['javascript:alert(1)', APP, 'scheme'],
  ['not a url', APP, 'parse'],
  ['', APP, 'type'],
  [LINK, '', 'app-origin'],
  [LINK, 'not an origin', 'app-origin'],
  [LINK, 'https://pay.example.com/', 'app-origin'],
  [LINK, 'ftp://pay.example.com', 'app-origin'],
  [LINK, 'http://pay.example.com', 'app-origin'],
];

describe('validateEmbedLink', () => {
  it.each(VECTORS)('%s vs %s -> %s', (link, app, want) => {
    expect(validateEmbedLink(link, app)).toBe(want);
  });
  it('length bound', () => {
    expect(validateEmbedLink(`${APP}/#gpi=v1.${'a'.repeat(21_000)}`, APP)).toBe('ok');
    expect(validateEmbedLink(`${APP}/#gpi=v1.${'a'.repeat(22_000)}`, APP)).toBe('length');
  });
  it('non-string', () => {
    expect(validateEmbedLink(5, APP)).toBe('type');
    expect(validateEmbedLink(LINK, 5 as unknown as string)).toBe('app-origin');
  });
});

describe('escaping', () => {
  it('escapes & < > " \' and backtick (EMBED-2)', () => {
    expect(escapeAttr(`&<>"'\``)).toBe('&amp;&lt;&gt;&quot;&#39;&#96;');
    expect(escapeHtml('a&b')).toBe('a&amp;b');
    expect(escapeAttr('plain')).toBe('plain');
  });
});

describe('makeSnippet', () => {
  it('default output: one button, one script, no inline style or handlers (EMBED-4)', () => {
    const s = makeSnippet(LINK, APP);
    expect(s).toBe(
      `<button type="button" class="ghostpay-btn ghostpay-btn--default" data-ghostpay data-invoice="${LINK}">Pay with GhostPay</button>\n` +
        `<script defer src="${APP}/ghostpay-embed-v1.js"></script>`,
    );
    expect(s.match(/<button/g)).toHaveLength(1);
    expect(s.match(/<script/g)).toHaveLength(1);
    expect(s).not.toMatch(/\sstyle=|\son\w+=|javascript:|<iframe|<link/i);
  });
  it('T-1 hostile label is rejected or escaped, never raw', () => {
    const s = makeSnippet(LINK, APP, { label: '"><script>alert(1)</script>' });
    expect(s).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(s.match(/<script/g)).toHaveLength(1);
  });
  it('options: variant, stylesheet, fallback', () => {
    const s = makeSnippet(LINK, APP, {
      label: '  Buy & go ',
      variant: 'dark',
      includeStylesheet: true,
      includeFallback: true,
    });
    expect(s.split('\n')).toEqual([
      `<link rel="stylesheet" href="${APP}/ghostpay-embed-v1.css">`,
      `<button type="button" class="ghostpay-btn ghostpay-btn--dark" data-ghostpay data-invoice="${LINK}">Buy &amp; go</button>`,
      `<noscript><a href="${LINK}" target="_blank" rel="noopener noreferrer">Buy &amp; go</a></noscript>`,
      `<script defer src="${APP}/ghostpay-embed-v1.js"></script>`,
    ]);
    expect(makeSnippet(LINK, APP, { variant: 'outline' })).toContain('ghostpay-btn--outline');
  });
  it('T-2 other origin refused', () => {
    expect(code(() => makeSnippet('https://evil.example.net/#gpi=v1.x', APP))).toBe('BAD_LINK:origin');
    expect(code(() => makeSnippet(LINK, 'nope'))).toBe('BAD_ORIGIN');
  });
  it('re-serialises link so quotes in the fragment cannot break the attribute', () => {
    const s = makeSnippet(`${APP}/#gpi=v1.a"b<c>d'e`, APP);
    expect(s).not.toMatch(/data-invoice="[^"]*"[^ >]/);
    expect(s).not.toContain('<c>');
    expect(s).toContain('d&#39;e');
  });
  it('allowlisted options only', () => {
    expect(code(() => makeSnippet(LINK, APP, { onclick: 'x' } as never))).toBe('BAD_OPTION:onclick');
    expect(code(() => makeSnippet(LINK, APP, { variant: 'x' as never }))).toBe('BAD_OPTION:variant');
  });
  it('label rules', () => {
    for (const label of ['', '   ', 'x'.repeat(81), 'a\nb', 'a\u0000b', 'a b']) {
      expect(code(() => makeSnippet(LINK, APP, { label }))).toBe('BAD_LABEL');
    }
    expect(code(() => makeSnippet(LINK, APP, { label: 5 as never }))).toBe('BAD_LABEL');
  });
});
