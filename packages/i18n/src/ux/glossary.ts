import { I18nError } from './errors.js';
import { type ReadingLevel, estimateReadingLevel } from './readability.js';

/** A glossary term. All text is plain (no markup). */
export interface GlossaryTerm {
  /** kebab-case id, stable across locales. */
  readonly id: string;
  readonly term: string;
  readonly aliases: readonly string[];
  /** One short sentence for tooltips. */
  readonly short: string;
  /** Plain-language explanation (target: grade 8 or lower). */
  readonly plain: string;
  /** Optional precise explanation for advanced readers. */
  readonly detail?: string;
  /** Topic ids this term is relevant to. */
  readonly topics: readonly string[];
  /** Related term ids (links). */
  readonly related: readonly string[];
}

/** A contextual help topic. */
export interface HelpTopic {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly steps?: readonly string[];
  readonly termIds: readonly string[];
  readonly relatedTopicIds: readonly string[];
}

/** Glossary + help registry. */
export interface HelpRegistry {
  readonly terms: readonly GlossaryTerm[];
  readonly topics: readonly HelpTopic[];
}

/** Allowed id shape for terms and topics. */
export const HELP_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const MAX_QUERY = 100;
const MAX_TOKENS = 8;
const MAX_LINK_TEXT = 10_000;

/** Problem found by {@link validateRegistry}. */
export interface RegistryIssue {
  readonly code:
    | 'bad-id'
    | 'duplicate-id'
    | 'dangling-related'
    | 'dangling-topic-term'
    | 'dangling-related-topic'
    | 'alias-collision'
    | 'plain-too-hard'
    | 'empty-text';
  readonly id: string;
  readonly detail: string;
}

/**
 * Validate content integrity: ids, duplicates, dangling links, alias collisions and that `plain`
 * text stays at or below `maxPlainGrade` (default 9).
 */
export function validateRegistry(reg: HelpRegistry, maxPlainGrade = 9): RegistryIssue[] {
  const out: RegistryIssue[] = [];
  const termIds = new Set<string>();
  const topicIds = new Set<string>();
  const phrases = new Map<string, string>();
  for (const t of reg.terms) {
    if (!HELP_ID_RE.test(t.id)) out.push({ code: 'bad-id', id: t.id, detail: 'term id' });
    if (termIds.has(t.id)) out.push({ code: 'duplicate-id', id: t.id, detail: 'term' });
    termIds.add(t.id);
    if (t.term.trim() === '' || t.short.trim() === '' || t.plain.trim() === '') {
      out.push({ code: 'empty-text', id: t.id, detail: 'term/short/plain' });
    }
    for (const p of [t.term, ...t.aliases]) {
      const k = p.toLowerCase();
      const prev = phrases.get(k);
      if (prev !== undefined && prev !== t.id)
        out.push({ code: 'alias-collision', id: t.id, detail: `${k} also on ${prev}` });
      phrases.set(k, t.id);
    }
    if (estimateReadingLevel(t.plain).grade > maxPlainGrade) {
      out.push({ code: 'plain-too-hard', id: t.id, detail: String(estimateReadingLevel(t.plain).grade) });
    }
  }
  for (const t of reg.terms) {
    for (const r of t.related)
      if (!termIds.has(r)) out.push({ code: 'dangling-related', id: t.id, detail: r });
  }
  for (const tp of reg.topics) {
    if (!HELP_ID_RE.test(tp.id)) out.push({ code: 'bad-id', id: tp.id, detail: 'topic id' });
    if (topicIds.has(tp.id)) out.push({ code: 'duplicate-id', id: tp.id, detail: 'topic' });
    topicIds.add(tp.id);
  }
  for (const tp of reg.topics) {
    for (const r of tp.termIds)
      if (!termIds.has(r)) out.push({ code: 'dangling-topic-term', id: tp.id, detail: r });
    for (const r of tp.relatedTopicIds)
      if (!topicIds.has(r)) out.push({ code: 'dangling-related-topic', id: tp.id, detail: r });
  }
  return out;
}

/** A search hit. */
export interface SearchHit {
  readonly term: GlossaryTerm;
  readonly score: number;
}

/**
 * Search terms by query. All tokens must match somewhere; ranking: exact term 100, term prefix 60,
 * alias 50, term substring 30, short 15, plain/detail 5 (per token, summed). Ties sort by term name.
 * Queries over 100 chars or with no word characters return []. At most 8 tokens used.
 */
export function searchGlossary(reg: HelpRegistry, query: string, limit = 10): SearchHit[] {
  if (typeof query !== 'string' || query.length > MAX_QUERY) return [];
  const tokens = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const term of reg.terms) {
    const name = term.term.toLowerCase();
    const aliases = term.aliases.map((a) => a.toLowerCase());
    const short = term.short.toLowerCase();
    const body = `${term.plain} ${term.detail ?? ''}`.toLowerCase();
    let total = 0;
    let all = true;
    for (const tok of tokens) {
      let s = 0;
      if (name === tok) s = Math.max(s, 100);
      if (name.startsWith(tok)) s = Math.max(s, 60);
      if (aliases.some((a) => a === tok || a.startsWith(tok))) s = Math.max(s, 50);
      if (name.includes(tok)) s = Math.max(s, 30);
      if (short.includes(tok)) s = Math.max(s, 15);
      if (body.includes(tok)) s = Math.max(s, 5);
      if (s === 0) {
        all = false;
        break;
      }
      total += s;
    }
    if (all) hits.push({ term, score: total });
  }
  hits.sort((a, b) => b.score - a.score || a.term.term.localeCompare(b.term.term, 'en'));
  return hits.slice(0, Math.max(0, limit));
}

/** Get a term by id. */
export function getTerm(reg: HelpRegistry, id: string): GlossaryTerm | undefined {
  return reg.terms.find((t) => t.id === id);
}

/** Resolved help for a topic. */
export interface ResolvedHelp {
  readonly topic: HelpTopic;
  readonly terms: readonly GlossaryTerm[];
  readonly related: readonly HelpTopic[];
  readonly reading: ReadingLevel;
}

/**
 * Contextual help lookup by topic id. Unknown or malformed ids return undefined (the UI should
 * then show a generic help entry). Dangling links are skipped silently here; use validateRegistry in tests.
 */
export function lookupHelp(reg: HelpRegistry, topicId: string): ResolvedHelp | undefined {
  if (typeof topicId !== 'string' || !HELP_ID_RE.test(topicId)) return undefined;
  const topic = reg.topics.find((t) => t.id === topicId);
  if (topic === undefined) return undefined;
  const terms = topic.termIds.map((id) => getTerm(reg, id)).filter((t): t is GlossaryTerm => t !== undefined);
  const related = topic.relatedTopicIds
    .map((id) => reg.topics.find((t) => t.id === id))
    .filter((t): t is HelpTopic => t !== undefined);
  return {
    topic,
    terms,
    related,
    reading: estimateReadingLevel([topic.summary, ...(topic.steps ?? [])].join(' ')),
  };
}

/** Terms relevant to a topic id (via `topics` tag or the topic's `termIds`). */
export function termsForTopic(reg: HelpRegistry, topicId: string): GlossaryTerm[] {
  const topic = reg.topics.find((t) => t.id === topicId);
  return reg.terms.filter((t) => t.topics.includes(topicId) || (topic?.termIds.includes(t.id) ?? false));
}

/** A text or glossary-link segment. */
export type LinkSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'term'; readonly text: string; readonly termId: string };

const isWordChar = (c: string): boolean => /[A-Za-z0-9]/.test(c);

/**
 * Split text into segments, marking whole-word, case-insensitive occurrences of terms/aliases.
 * Longest match wins; overlaps resolved left to right. `firstOnly` (default true) links each
 * term once. Returns segments (never HTML) so the UI renders links as components.
 * @security Input over 10,000 chars is returned as a single text segment (DoS bound).
 */
export function linkGlossaryTerms(
  reg: HelpRegistry,
  text: string,
  opts: { readonly firstOnly?: boolean } = {},
): LinkSegment[] {
  if (text === '') return [];
  if (text.length > MAX_LINK_TEXT) return [{ type: 'text', text }];
  const firstOnly = opts.firstOnly ?? true;
  const lower = text.toLowerCase();
  const found: { start: number; end: number; id: string }[] = [];
  for (const t of reg.terms) {
    for (const phrase of [t.term, ...t.aliases]) {
      const p = phrase.toLowerCase();
      if (p === '') continue;
      let from = 0;
      for (;;) {
        const at = lower.indexOf(p, from);
        if (at < 0) break;
        const end = at + p.length;
        if (!isWordChar(lower.charAt(at - 1)) && !isWordChar(lower.charAt(end))) {
          found.push({ start: at, end, id: t.id });
        }
        from = at + 1;
      }
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const used = new Set<string>();
  const out: LinkSegment[] = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start < cursor) continue;
    if (firstOnly && used.has(f.id)) continue;
    if (f.start > cursor) out.push({ type: 'text', text: text.slice(cursor, f.start) });
    out.push({ type: 'term', text: text.slice(f.start, f.end), termId: f.id });
    used.add(f.id);
    cursor = f.end;
  }
  if (cursor < text.length) out.push({ type: 'text', text: text.slice(cursor) });
  return out;
}

/** Assert a registry is valid; throws listing the first issues. For build-time/test use. */
export function assertRegistry(reg: HelpRegistry, maxPlainGrade = 9): void {
  const issues = validateRegistry(reg, maxPlainGrade);
  if (issues.length > 0) {
    const first = issues[0];
    throw new I18nError(
      'bad-input',
      `help registry invalid: ${first?.code ?? ''} ${first?.id ?? ''} (${String(issues.length)} issues)`,
    );
  }
}
