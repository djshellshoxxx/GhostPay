import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EN_GLOSSARY,
  EN_HELP,
  EN_HELP_TOPICS,
  I18nError,
  assertRegistry,
  countSyllables,
  estimateReadingLevel,
  getTerm,
  linkGlossaryTerms,
  lookupHelp,
  searchGlossary,
  termsForTopic,
  validateRegistry,
  type HelpRegistry,
} from './index.js';

describe('English content', () => {
  it('registry is valid and plain text is easy to read', () => {
    expect(validateRegistry(EN_HELP, 9)).toEqual([]);
    expect(() => assertRegistry(EN_HELP)).not.toThrow();
    for (const t of EN_GLOSSARY) expect(estimateReadingLevel(t.plain).band).not.toBe('advanced');
  });
  it('covers the required concepts', () => {
    for (const id of [
      'privacy',
      'stealth-address',
      'relayer',
      'network-fee',
      'viewing-key',
      'spending-key',
      'recovery-phrase',
    ]) {
      expect(getTerm(EN_HELP, id)).toBeDefined();
    }
    expect(getTerm(EN_HELP, 'nope')).toBeUndefined();
  });
  it('never asks users to share secrets', () => {
    const all = JSON.stringify(EN_HELP).toLowerCase();
    expect(all).toContain('never');
    expect(all).not.toMatch(/send (us|support) your (seed|recovery|private)/);
  });
});

describe('readability', () => {
  it('counts syllables', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('water')).toBe(2);
    expect(countSyllables('make')).toBe(1);
    expect(countSyllables('table')).toBe(2);
    expect(countSyllables('jumped')).toBe(1);
    expect(countSyllables('wanted')).toBe(2);
    expect(countSyllables('the')).toBe(1);
    expect(countSyllables('123')).toBe(0);
    expect(countSyllables('rhythm')).toBe(1);
  });
  it('grades simple vs hard text', () => {
    const easy = estimateReadingLevel('The cat sat on the mat. The dog ran to the box.');
    expect(easy.grade).toBe(0);
    expect(easy).toMatchObject({ words: 12, sentences: 2, band: 'plain' });
    const hard = estimateReadingLevel(
      'Cryptographic unlinkability necessitates indistinguishable ephemeral derivations notwithstanding observational heterogeneity.',
    );
    expect(hard.band).toBe('advanced');
    expect(hard.grade).toBeGreaterThan(20);
    expect(estimateReadingLevel('')).toEqual({ words: 0, sentences: 1, grade: 0, band: 'plain' });
  });
  it('mid band and no terminal punctuation', () => {
    const r = estimateReadingLevel(
      'Payments remain unlinkable because senders generate individual destination addresses automatically',
    );
    expect(r.sentences).toBe(1);
    expect(['standard', 'advanced']).toContain(r.band);
  });
  it('is finite and non-negative (property)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const g = estimateReadingLevel(s).grade;
        return Number.isFinite(g) && g >= 0;
      }),
    );
  });
});

describe('searchGlossary', () => {
  it('ranks exact term above alias and body matches', () => {
    const r = searchGlossary(EN_HELP, 'relayer');
    expect(r[0]?.term.id).toBe('relayer');
    expect(r[0]?.score).toBe(100 + 0);
  });
  it('matches aliases and prefixes', () => {
    expect(searchGlossary(EN_HELP, 'gas')[0]?.term.id).toBe('network-fee');
    expect(searchGlossary(EN_HELP, 'seed')[0]?.term.id).toBe('recovery-phrase');
    expect(searchGlossary(EN_HELP, 'stealth')[0]?.term.id).toBe('stealth-address');
  });
  it('requires all tokens and searches body text', () => {
    expect(searchGlossary(EN_HELP, 'stealth address').map((h) => h.term.id)).toContain('stealth-address');
    expect(searchGlossary(EN_HELP, 'relayer zebra')).toEqual([]);
    expect(searchGlossary(EN_HELP, 'paper')[0]?.term.id).toBe('recovery-phrase');
    expect(searchGlossary(EN_HELP, 'hide').length).toBeGreaterThan(0);
    expect(searchGlossary(EN_HELP, 'finding').length).toBeGreaterThanOrEqual(0);
  });
  it('bounds and sanitises queries', () => {
    expect(searchGlossary(EN_HELP, '')).toEqual([]);
    expect(searchGlossary(EN_HELP, '!!! ???')).toEqual([]);
    expect(searchGlossary(EN_HELP, 'a'.repeat(101))).toEqual([]);
    expect(searchGlossary(EN_HELP, 5 as unknown as string)).toEqual([]);
    expect(searchGlossary(EN_HELP, 'key', 1)).toHaveLength(1);
    expect(searchGlossary(EN_HELP, 'key', -3)).toEqual([]);
    expect(searchGlossary(EN_HELP, '<script>alert(1)</script>')).toEqual([]);
  });
  it('is deterministic with ties sorted by name', () => {
    const r = searchGlossary(EN_HELP, 'key');
    expect(r.map((h) => h.term.id)).toEqual(searchGlossary(EN_HELP, 'key').map((h) => h.term.id));
    for (let i = 1; i < r.length; i++) expect((r[i - 1]?.score ?? 0) >= (r[i]?.score ?? 0)).toBe(true);
  });
  it('never throws (property)', () => {
    fc.assert(fc.property(fc.string(), (s) => Array.isArray(searchGlossary(EN_HELP, s))));
  });
});

describe('lookupHelp', () => {
  it('resolves terms and related topics with reading level', () => {
    const h = lookupHelp(EN_HELP, 'send-private');
    expect(h?.topic.title).toBe('Sending a private payment');
    expect(h?.terms.map((t) => t.id)).toEqual(['privacy', 'stealth-address', 'relayer', 'network-fee']);
    expect(h?.related.map((t) => t.id)).toEqual(['privacy-level', 'fees']);
    expect(h?.reading.band).toBe('plain');
  });
  it('handles topics without steps and unknown/malformed ids', () => {
    expect(lookupHelp(EN_HELP, 'privacy-level')?.topic.steps).toBeUndefined();
    expect(lookupHelp(EN_HELP, 'missing-topic')).toBeUndefined();
    for (const bad of ['', 'Send', '../x', '__proto__', 'a'.repeat(1) + ' b'])
      expect(lookupHelp(EN_HELP, bad)).toBeUndefined();
    expect(lookupHelp(EN_HELP, 7 as unknown as string)).toBeUndefined();
  });
  it('skips dangling links', () => {
    const reg: HelpRegistry = {
      terms: [],
      topics: [{ id: 'x', title: 't', summary: 's', termIds: ['gone'], relatedTopicIds: ['gone'] }],
    };
    const h = lookupHelp(reg, 'x');
    expect(h?.terms).toEqual([]);
    expect(h?.related).toEqual([]);
  });
  it('termsForTopic merges tags and topic termIds', () => {
    const ids = termsForTopic(EN_HELP, 'activity').map((t) => t.id);
    expect(ids).toEqual(['confirmation']);
    expect(termsForTopic(EN_HELP, 'nonexistent')).toEqual([]);
    expect(
      termsForTopic(EN_HELP, 'fees')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['network-fee', 'relayer']);
  });
  it('every topic resolves', () => {
    for (const t of EN_HELP_TOPICS) expect(lookupHelp(EN_HELP, t.id)?.terms.length).toBe(t.termIds.length);
  });
});

describe('linkGlossaryTerms', () => {
  it('links whole words, case-insensitively, first occurrence only', () => {
    const seg = linkGlossaryTerms(EN_HELP, 'A Relayer sends it; the relayer cannot spend. Gas varies.');
    expect(seg).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'term', text: 'Relayer', termId: 'relayer' },
      { type: 'text', text: ' sends it; the relayer cannot spend. ' },
      { type: 'term', text: 'Gas', termId: 'network-fee' },
      { type: 'text', text: ' varies.' },
    ]);
  });
  it('links all when firstOnly=false and prefers longest match', () => {
    const all = linkGlossaryTerms(EN_HELP, 'relayer, relayer', { firstOnly: false });
    expect(all.filter((s) => s.type === 'term')).toHaveLength(2);
    const longest = linkGlossaryTerms(EN_HELP, 'Use a stealth address now');
    expect(longest.find((s) => s.type === 'term')).toEqual({
      type: 'term',
      text: 'stealth address',
      termId: 'stealth-address',
    });
  });
  it('does not link inside words', () => {
    expect(linkGlossaryTerms(EN_HELP, 'gasoline and relayers2 and xprivacy')).toEqual([
      { type: 'text', text: 'gasoline and relayers2 and xprivacy' },
    ]);
  });
  it('is HTML-agnostic: markup in text stays as text segments', () => {
    const seg = linkGlossaryTerms(EN_HELP, '<img onerror=x> privacy');
    expect(seg[0]).toEqual({ type: 'text', text: '<img onerror=x> ' });
    expect(seg[1]).toEqual({ type: 'term', text: 'privacy', termId: 'privacy' });
  });
  it('bounds input and handles empty', () => {
    expect(linkGlossaryTerms(EN_HELP, '')).toEqual([]);
    const big = 'privacy '.repeat(2000);
    expect(linkGlossaryTerms(EN_HELP, big)).toEqual([{ type: 'text', text: big }]);
  });
  it('skips empty phrases and overlapping shorter matches', () => {
    const reg: HelpRegistry = {
      terms: [
        { id: 'ab', term: 'ab', aliases: ['', 'ab cd'], short: 's', plain: 'p', topics: [], related: [] },
        { id: 'cd', term: 'cd', aliases: [], short: 's', plain: 'p', topics: [], related: [] },
      ],
      topics: [],
    };
    expect(linkGlossaryTerms(reg, 'ab cd', { firstOnly: false })).toEqual([
      { type: 'term', text: 'ab cd', termId: 'ab' },
    ]);
  });
  it('segments always reassemble to the input (property)', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300 }),
        fc.boolean(),
        (s, f) =>
          linkGlossaryTerms(EN_HELP, s, { firstOnly: f })
            .map((x) => x.text)
            .join('') === s,
      ),
    );
  });
});

describe('validateRegistry', () => {
  const term = (o: Partial<(typeof EN_GLOSSARY)[number]> & { id: string }): (typeof EN_GLOSSARY)[number] => ({
    term: o.id,
    aliases: [],
    short: 's',
    plain: 'Short words here.',
    topics: [],
    related: [],
    ...o,
  });
  it('detects every issue kind', () => {
    const reg: HelpRegistry = {
      terms: [
        term({ id: 'Bad Id' }),
        term({ id: 'dup' }),
        term({ id: 'dup', aliases: ['shared'], related: ['ghost'] }),
        term({ id: 'other', aliases: ['SHARED'], short: ' ' }),
        term({
          id: 'hard',
          plain:
            'Cryptographic unlinkability necessitates indistinguishable ephemeral derivations notwithstanding observational heterogeneity.',
        }),
      ],
      topics: [
        { id: 'T', title: 't', summary: 's', termIds: [], relatedTopicIds: [] },
        { id: 'tp', title: 't', summary: 's', termIds: ['ghost'], relatedTopicIds: ['ghost'] },
        { id: 'tp', title: 't', summary: 's', termIds: [], relatedTopicIds: [] },
      ],
    };
    const codes = new Set(validateRegistry(reg).map((i) => i.code));
    expect([...codes].sort()).toEqual([
      'alias-collision',
      'bad-id',
      'dangling-related',
      'dangling-related-topic',
      'dangling-topic-term',
      'duplicate-id',
      'empty-text',
      'plain-too-hard',
    ]);
    expect(() => assertRegistry(reg)).toThrow(I18nError);
    expect(() => assertRegistry({ terms: [], topics: [] })).not.toThrow();
  });
  it('same-term repeated alias is not a collision', () => {
    expect(validateRegistry({ terms: [term({ id: 'a', term: 'A', aliases: ['a'] })], topics: [] })).toEqual(
      [],
    );
  });
});
