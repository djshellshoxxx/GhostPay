import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MetadataHardeningError } from './guard.js';
import { findUnsafeAnchors, MAX_MARKUP_LENGTH } from './web.js';

describe('MH-WEB-1 anchor lint: attribute tokenisation', () => {
  it('finds target=_blank when a quoted attribute value contains ">" (regression: tag was cut short)', () => {
    expect(findUnsafeAnchors('<a title="x>y" target="_blank">z</a>')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(findUnsafeAnchors("<a title='a > b' target=_blank rel='noopener noreferrer'>z</a>")).toEqual([]);
  });
  it('does not treat a custom element or longer tag name as an anchor', () => {
    expect(findUnsafeAnchors('<a-foo target="_blank">x</a-foo><abbr target="_blank">y</abbr>')).toEqual([]);
  });
  it('recognises the tag name with any HTML whitespace or a self-closing slash after it', () => {
    expect(findUnsafeAnchors('<a\ttarget="_blank">')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(findUnsafeAnchors('<a\nhref="/"\ntarget="_blank"/>')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(findUnsafeAnchors('<a/target="_blank">')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
  });
  it('first duplicate attribute wins, as in an HTML parser', () => {
    expect(findUnsafeAnchors('<a target="_blank" rel="noopener" rel="noopener noreferrer">')).toEqual([{ index: 0, reason: 'MISSING_NOREFERRER' }]);
    expect(findUnsafeAnchors('<a target="_self" target="_blank">')).toEqual([]);
    expect(findUnsafeAnchors('<a target="_blank" target="_self">')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
  });
  it('matches the _blank keyword exactly (ASCII case-insensitive), not as a prefix', () => {
    expect(findUnsafeAnchors('<a target="_blank2">')).toEqual([]);
    expect(findUnsafeAnchors('<a target="_BlAnK">')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(findUnsafeAnchors('<a target=_blank>')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(findUnsafeAnchors('<a target = "_blank" >')).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
  });
  it('splits rel on ASCII whitespace only (a no-break space is part of the token)', () => {
    expect(findUnsafeAnchors('<a target="_blank" rel="noopener noreferrer">')).toEqual([{ index: 0, reason: 'MISSING_NOREFERRER' }]);
    expect(findUnsafeAnchors('<a target="_blank" rel="noopener noreferrer">')).toEqual([{ index: 0, reason: 'MISSING_NOREFERRER' }]);
    expect(findUnsafeAnchors('<a target="_blank" rel="noopener\tnoreferrer\n">')).toEqual([]);
  });
  it('does not fold non-ASCII lookalikes into the keywords', () => {
    expect(findUnsafeAnchors('<a target="_blank" rel="ｎｏｒｅｆｅｒｒｅｒ noopener">')).toEqual([{ index: 0, reason: 'MISSING_NOREFERRER' }]);
    expect(findUnsafeAnchors('<a target="_blank" rel="NOREFERRER NOOPENER">')).toEqual([]);
    // Kelvin sign and dotted capital I must not match ASCII letters.
    expect(findUnsafeAnchors('<a target="_blank" rel="noreferrer noopener" data-x="Kİ">')).toEqual([]);
  });
  it('handles Unicode in unrelated attributes, text and href', () => {
    const html = '<a href="https://bücher.example/日本語?q=😀" title="Ünïcödé > ok" target="_blank">日本語</a>';
    expect(findUnsafeAnchors(html)).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
  });
  it('keeps the ordinal of every anchor (including those without target) as index', () => {
    const html = '<a href="1">x</a><a href="2" target="_blank">y</a><p>z</p><a href="3" target="_blank" rel="noreferrer noopener">w</a><a target="_blank">v</a>';
    expect(findUnsafeAnchors(html)).toEqual([
      { index: 1, reason: 'MISSING_REL' },
      { index: 3, reason: 'MISSING_REL' },
    ]);
  });
  it('ignores an unterminated tag (an HTML parser drops it at end of input)', () => {
    expect(findUnsafeAnchors('<a target="_blank"')).toEqual([]);
    expect(findUnsafeAnchors('<a title="never closed target="_blank">')).toEqual([]);
    expect(findUnsafeAnchors('<a ')).toEqual([]);
    expect(findUnsafeAnchors('')).toEqual([]);
  });
  it('handles attribute edge syntax without hanging or throwing', () => {
    for (const s of ['<a =>', '<a ===>', '<a "">', '<a target=>', '<a target= >', '<a rel=\'>', '<a //// >', '<a\0>', '<a target="_blank"rel="noopener noreferrer">']) {
      expect(() => findUnsafeAnchors(s)).not.toThrow();
    }
    // No whitespace between attributes: the parser still reads rel (parse error, but both attributes exist).
    expect(findUnsafeAnchors('<a target="_blank"rel="noopener noreferrer">')).toEqual([]);
  });
});

describe('MH-WEB-1 anchor lint: input contract', () => {
  it('fails closed on a non-string instead of reporting "no unsafe anchors"', () => {
    for (const v of [undefined, null, 42, {}, [], ['<a target="_blank">'], new String('<a target="_blank">')]) {
      expect(() => findUnsafeAnchors(v as string)).toThrow(MetadataHardeningError);
    }
  });
  it('rejects markup above the size limit with LIMIT_EXCEEDED', () => {
    try {
      findUnsafeAnchors('x'.repeat(MAX_MARKUP_LENGTH + 1));
      expect.unreachable();
    } catch (e) {
      expect((e as MetadataHardeningError).code).toBe('LIMIT_EXCEEDED');
    }
    expect(findUnsafeAnchors('x'.repeat(MAX_MARKUP_LENGTH))).toEqual([]);
  });
  it('is linear on pathological input (regression: many unterminated "<a " took seconds)', () => {
    const t0 = Date.now();
    expect(findUnsafeAnchors('<a '.repeat(Math.floor(MAX_MARKUP_LENGTH / 3)))).toEqual([]);
    expect(findUnsafeAnchors('<a x="'.repeat(Math.floor(MAX_MARKUP_LENGTH / 6)))).toEqual([]);
    expect(findUnsafeAnchors(`<a${' '.repeat(MAX_MARKUP_LENGTH - 40)}target="_blank">`)).toEqual([{ index: 0, reason: 'MISSING_REL' }]);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it('does not mutate or retain its input and gives identical results when repeated', () => {
    const html = '<a href="/" target="_blank">x</a><a href="/y" target="_blank" rel="noreferrer noopener">y</a>';
    const first = findUnsafeAnchors(html);
    for (let i = 0; i < 5; i++) expect(findUnsafeAnchors(html)).toEqual(first);
    expect(html).toBe('<a href="/" target="_blank">x</a><a href="/y" target="_blank" rel="noreferrer noopener">y</a>');
  });
});

describe('MH-WEB-1 anchor lint: generated markup matches an independent oracle', () => {
  const tokens = ['noopener', 'noreferrer', 'nofollow', 'external', 'opener'];
  const ws = fc.constantFrom(' ', '\t', '\n', '\r', '\f', '  ');
  const quote = fc.constantFrom('"', "'");
  const anchor = fc.record({
    target: fc.constantFrom(undefined, '_blank', '_BLANK', '_self', '_top', 'x'),
    relTokens: fc.option(fc.subarray(tokens), { nil: undefined }),
    relCase: fc.boolean(),
    lead: ws,
    mid: ws,
    q: quote,
    decoys: fc.boolean(),
    order: fc.boolean(),
    gtInTitle: fc.boolean(),
  });
  it('flags exactly the anchors the HTML semantics say are unsafe', () => {
    fc.assert(
      fc.property(fc.array(anchor, { minLength: 0, maxLength: 8 }), (list) => {
        const expected: { index: number; reason: string }[] = [];
        const html = list
          .map((a, index) => {
            const parts: string[] = [];
            if (a.decoys) parts.push('data-target="_blank"', 'data-rel="noopener noreferrer"', 'aria-rel="noreferrer noopener"');
            if (a.gtInTitle) parts.push(`title=${a.q}1 > 0${a.q}`);
            const tgt = a.target === undefined ? undefined : `target=${a.q}${a.target}${a.q}`;
            const relValue = a.relTokens === undefined ? undefined : a.relTokens.map((t) => (a.relCase ? t.toUpperCase() : t)).join(' ');
            const rel = relValue === undefined ? undefined : `rel=${a.q}${relValue}${a.q}`;
            const pair = a.order ? [tgt, rel] : [rel, tgt];
            for (const p of pair) if (p !== undefined) parts.push(p);
            if (a.target?.toLowerCase() === '_blank') {
              if (a.relTokens === undefined) expected.push({ index, reason: 'MISSING_REL' });
              else if (!a.relTokens.includes('noreferrer')) expected.push({ index, reason: 'MISSING_NOREFERRER' });
              else if (!a.relTokens.includes('noopener')) expected.push({ index, reason: 'MISSING_NOOPENER' });
            }
            return `<p>t</p><a${a.lead}href="/${index}"${a.mid}${parts.join(a.mid)}>link ${index}</a>`;
          })
          .join('');
        expect(findUnsafeAnchors(html)).toEqual(expected);
      }),
      { seed: 0x6d68, numRuns: 400 },
    );
  });
  it('never throws a non-typed error on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), fc.string({ unit: 'binary', maxLength: 200 }), (a, b) => {
        for (const s of [a, b, `<a ${a}>`, `<a ${b} target=_blank>`, `<a target="${a}" rel='${b}'>`]) {
          expect(Array.isArray(findUnsafeAnchors(s))).toBe(true);
        }
      }),
      { seed: 0x6d68, numRuns: 300 },
    );
  });
});
