/**
 * Claims and payment-safety wording guard for the text GhostPay ships.
 *
 * Two layers:
 * 1. FORBIDDEN: affirmative claims that must never ship anywhere (English source catalog, help.html, privacy.html):
 *    anonymity/unlinkability, "audited", mainnet readiness, "verified seller", refund promises, invoice expiry
 *    reversing a transfer, and guaranteed privacy/payment/value. A negator earlier in the same clause or inside the
 *    match ("not", "never", "cannot", ...) means the text is a denial. Only mainnet wording may also be a future
 *    condition ("until mainnets are enabled"); a conditional refund promise ("if it fails you will be refunded") fails.
 * 2. REVIEWED: every English catalog message that merely mentions one of these topics is pinned to a fingerprint of
 *    the exact text that was reviewed. Editing such a message, or adding a new one, fails until the wording is
 *    re-reviewed against the cited source and its fingerprint updated here.
 *
 * Sources: .claude/skills/ghostpay-security-invariants/REFERENCE.md section 1 (SECURITY.md,
 * docs/user/privacy-limits.md, ADR-0002, ADR-0010, ADR-0015, docs/audits/08-completion-gates.md), and the payment
 * safety invariants "never display an unsupported refund guarantee" and "never treat invoice expiry as automatic
 * on-chain reversal". English only: the es/ar/ja catalogs are machine drafts covered by native review (IN-3).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOURCE_CATALOG } from './catalog';

type Messages = Readonly<Record<string, string>>;

interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly source: string;
  /** Release-status wording may describe a future condition ("until mainnets are enabled"). */
  readonly conditionalOk?: true;
}

const FORBIDDEN: readonly Rule[] = [
  {
    id: 'anonymity',
    pattern: /\b(?:is|are|stays?|remains?|keeps? (?:you|it|them)|makes? (?:you|it|them)|fully|completely|totally|truly|100 ?%)\s+(?:anonymous|untraceable|untrackable|unlinkable|invisible)\b/i,
    source: 'docs/user/privacy-limits.md',
  },
  {
    id: 'anonymous-payments',
    pattern: /\b(?:anonymous|untraceable|untrackable|unlinkable)\s+(?:payments?|transactions?|transfers?|invoices?)\b/i,
    source: 'docs/user/privacy-limits.md',
  },
  {
    id: 'audited',
    pattern: /\b(?:been|is|are|was|were)\s+(?:independently\s+|externally\s+|professionally\s+|formally\s+|fully\s+)?audited\b/i,
    source: 'SECURITY.md; docs/audits/08-completion-gates.md',
  },
  {
    id: 'mainnet',
    pattern: /\bmainnets?(?:[- ](?:ready|enabled|supported|live)|\s+(?:is|are)\s+(?:now\s+)?(?:enabled|supported|live|available))\b/i,
    source: 'SECURITY.md; ADR-0015',
    conditionalOk: true,
  },
  { id: 'verified-seller', pattern: /\bverified\s+(?:seller|merchant)\b/i, source: 'ADR-0002; ADR-0010' },
  {
    id: 'refund-promise',
    pattern: /\b(?:(?:will|shall|can|may|automatically|always|guaranteed(?:\s+to)?)\s+(?:be\s+)?refund(?:ed|s)?|(?:full|automatic|guaranteed|instant)\s+refunds?|money[- ]back)\b/i,
    source: 'payment-safety invariant: no unsupported refund guarantee',
  },
  {
    id: 'expiry-reversal',
    pattern: /\b(?:expir\w*|expiration)\b[^.;:!?]{0,48}?\b(?:refund|revers|cancel|undo)\w*/i,
    source: 'payment-safety invariant: expiry is not on-chain reversal (ADR-0026)',
  },
  {
    id: 'guarantee',
    pattern: /\bguaranteed?\s+(?:privacy|anonymity|payments?|delivery|settlement|refunds?|confirmation|finality|value|price|rate)\b/i,
    source: 'ADR-0012; docs/user/privacy-limits.md',
  },
];

/** Topics whose every mention in the catalog needs a reviewed fingerprint. */
const REVIEW_TOPICS: readonly Rule[] = [
  { id: 'privacy-strength', pattern: /\b(?:anonym\w*|unlinkab\w*|untraceab\w*|untrackab\w*|invisible|fully private|completely private|totally private)\b/i, source: 'docs/user/privacy-limits.md' },
  { id: 'audit', pattern: /\b(?:un)?audit\w*/i, source: 'SECURITY.md' },
  { id: 'release-status', pattern: /\b(?:mainnet\w*|deployed|hosted|production[- ]ready|official\w*)\b/i, source: 'SECURITY.md; ADR-0015' },
  { id: 'seller-identity', pattern: /\bverified (?:seller|merchant|business|identity)\b|\b(?:seller|merchant)(?:’s|'s)? (?:identity )?(?:is )?verified\b/i, source: 'ADR-0002; ADR-0010' },
  { id: 'refund', pattern: /\b(?:refund\w*|charge-?backs?|money[- ]back)\b/i, source: 'payment-safety invariants' },
  { id: 'guarantee', pattern: /\b(?:guarantee\w*|warrant(?:y|ies|ed)|insured?)\b/i, source: 'ADR-0012' },
  { id: 'reversal', pattern: /\b(?:revers\w*|claw[- ]?backs?|undo(?:ne|es)?)\b/i, source: 'payment-safety invariants' },
];

/** Earlier in the same clause (or inside the match), these words turn a claim into a denial. */
const NEGATOR = /\b(?:not|never|no|none|cannot|without)\b|n't\b/i;
/** Only for rules marked `conditionalOk`: a future condition, not a present claim. */
const CONDITIONAL = /\b(?:until|unless|before|once|if|when)\b/i;
const CLAUSE_END = /[.;:!?]/;
const LOOKBACK = 48;

/** Matches of the rule in `text` that are affirmed: not negated (or, where allowed, conditional) in their clause. */
function affirmed(text: string, rule: Rule): string[] {
  const { pattern } = rule;
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const found: string[] = [];
  for (const match of text.matchAll(global)) {
    const clause = text.slice(Math.max(0, match.index - LOOKBACK), match.index).split(CLAUSE_END).pop() ?? '';
    if (NEGATOR.test(clause) || NEGATOR.test(match[0])) continue;
    if (rule.conditionalOk === true && CONDITIONAL.test(clause)) continue;
    found.push(match[0]);
  }
  return found;
}

function forbiddenClaims(where: string, text: string): string[] {
  return FORBIDDEN.flatMap((rule) => affirmed(text, rule).map((hit) => `${where}: ${rule.id} "${hit}" (${rule.source})`));
}

function fingerprint(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function topicsOf(text: string): string[] {
  return REVIEW_TOPICS.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
}

interface Reviewed { readonly topics: readonly string[]; readonly fp: string; readonly why: string }

/**
 * Reviewed wording, pinned to the exact English text. When a test below fails for one of these keys, re-read the
 * message against the cited source, then update `topics`/`fp` from the failure output and record why it is safe.
 */
const REVIEWED: Readonly<Record<string, Reviewed>> = {
  'pay.delay.hint': { topics: ['privacy-strength'], fp: '16b44f29dd386793', why: 'delay is timing friction, not anonymity' },
  'disclosure.limit.4': { topics: ['privacy-strength'], fp: '17c57959cf676906', why: 'delay is timing friction, not anonymity' },
  'about.noAudit': { topics: ['audit'], fp: '48517591ea8f5497', why: 'states that no external audit was performed' },
  'disclosure.limit.6': { topics: ['audit'], fp: '01dcfb3158695ae4', why: 'states trusted components and no external audit' },
  'app.shell.tagline': { topics: ['audit'], fp: 'b49229c72393afd5', why: 'says unaudited software' },
  'policy.warning.title': { topics: ['audit'], fp: '90961c7cd6cd862b', why: 'says experimental and unaudited' },
  'btc.warning.body': { topics: ['audit', 'release-status'], fp: '45c4776f0ff020fd', why: 'unaudited, mainnet disabled, valueless coins only' },
  'sol.warning.body': { topics: ['audit', 'release-status'], fp: 'b14942b712e6f02b', why: 'unaudited, mainnet disabled, valueless coins only' },
  'tron.warning.body': { topics: ['audit', 'release-status'], fp: 'fbc637264184707a', why: 'unaudited, mainnet disabled, valueless coins only' },
  'registry.canonicalTail': { topics: ['release-status'], fp: '228c24afed34105d', why: 'test networks only until mainnets are enabled' },
  'policy.network.notPinned': { topics: ['release-status'], fp: '9c63d5da7653e6ce', why: 'contracts the user deployed; no GhostPay deployment claimed' },
  'policy.create.keepBody': { topics: ['release-status'], fp: 'b1575b8ac262a0ad', why: 'user-initiated account deployment' },
  'policy.account.notDeployed': { topics: ['release-status'], fp: 'e75544b4c5f357f8', why: 'not deployed yet; deploying is public' },
  'tron.node.hint': { topics: ['release-status'], fp: 'c2618bb34474b89e', why: 'refuses a mainnet node; cannot prove the network' },
  'sol.error.mainnet': { topics: ['release-status'], fp: '40645fa274e7e8e5', why: 'mainnet is disabled' },
  'tron.error.mainnet': { topics: ['release-status'], fp: '28f77d6c2d59d197', why: 'mainnet is disabled' },
  'btc.verification.mode.hosted.mode': { topics: ['release-status'], fp: '78d3a0aa25d9ceb2', why: 'names a third-party scanning option, not a GhostPay host' },
  'registry.ensResolved': { topics: ['seller-identity'], fp: 'eb1cbf4e41731fe5', why: 'a name is not verified merchant identity' },
  'pay.buffer.estimate': { topics: ['refund', 'guarantee'], fp: '8803d887534ade12', why: 'estimate, not a guarantee; never refunded' },
  'stealthExport.details.futureDeposits': { topics: ['refund'], fp: '3aaece909c4893d0', why: 'warns never to hand a payment key to the payer as a refund' },
  'stealthExport.raw.confirm.body': { topics: ['refund'], fp: '7dcf8373ba06306e', why: 'warns never to hand a payment key to the payer as a refund' },
  'pay.pricing.quote': { topics: ['guarantee'], fp: '6addaad3a47ba5a2', why: 'not a guaranteed fiat value' },
  'scan.privacySet.body': { topics: ['guarantee'], fp: '18cb2f42ce693e60', why: 'rough local heuristic, not a guarantee' },
  'registry.publicAssoc.body': { topics: ['reversal'], fp: 'e9f9c989e1fcd9bd', why: 'public registration cannot be undone' },
  'btc.sweep.destinationHint': { topics: ['reversal'], fp: '02317eae3a19fe61', why: 'a sent transaction cannot be reversed' },
  'sol.destination.hint': { topics: ['reversal'], fp: '7d218a68890669a9', why: 'a sent transaction cannot be reversed' },
  'tron.destination.hint': { topics: ['reversal'], fp: '68f42b63cf492689', why: 'a sent transaction cannot be reversed' },
  'scan.tags.deleteConfirm': { topics: ['reversal'], fp: 'a3afac193936fe46', why: 'local deletion cannot be undone' },
  'tagArchive.wipe.last': { topics: ['reversal'], fp: '1973071dc3166eba', why: 'local deletion cannot be undone' },
  'ledger.late.decision': { topics: ['reversal'], fp: '491ab2f0550fa7a1', why: 'acceptance is a local decision; expiry never reverses a transfer' },
  'wallet.warning.missingRdns': { topics: ['reversal'], fp: 'f019215ee6f160f5', why: 'reverse-DNS identifier, not a reversal claim' },
};

function unreviewedMentions(messages: Messages, reviewed: Readonly<Record<string, Reviewed>>): string[] {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(messages)) {
    const topics = topicsOf(text);
    if (topics.length === 0) continue;
    const entry = reviewed[key];
    const current = `{ topics: ${JSON.stringify(topics)}, fp: '${fingerprint(text)}' }`;
    if (entry === undefined) problems.push(`${key}: unreviewed mention ${current}: ${JSON.stringify(text)}`);
    else if (entry.fp !== fingerprint(text) || JSON.stringify(entry.topics) !== JSON.stringify(topics)) {
      problems.push(`${key}: wording changed since review, now ${current}: ${JSON.stringify(text)}`);
    }
  }
  for (const key of Object.keys(reviewed)) {
    const text = messages[key];
    if (text === undefined || topicsOf(text).length === 0) problems.push(`${key}: stale review entry (message removed or no longer on a reviewed topic)`);
  }
  return problems;
}

/** Visible text of a static page: scripts, styles and tags removed, common entities decoded, whitespace collapsed. */
function pageText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&rsquo;|&#8217;|&#39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

const SHIPPED_PAGES = ['help.html', 'privacy.html'] as const;
const messages: Messages = SOURCE_CATALOG.messages;

describe('shipped wording: forbidden claims', () => {
  it('the English source catalog affirms none of them', () => {
    expect(Object.entries(messages).flatMap(([key, text]) => forbiddenClaims(key, text))).toEqual([]);
  });

  it.each(SHIPPED_PAGES)('%s affirms none of them', (page) => {
    const text = pageText(readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8'));
    expect(text.length).toBeGreaterThan(1000);
    expect(forbiddenClaims(page, text)).toEqual([]);
  });
});

describe('shipped wording: reviewed mentions', () => {
  it('every catalog message on a sensitive topic is reviewed at its current text', () => {
    expect(unreviewedMentions(messages, REVIEWED)).toEqual([]);
  });

  it('review entries name a reason', () => {
    expect(Object.entries(REVIEWED).filter(([, entry]) => entry.why.trim().length < 10).map(([key]) => key)).toEqual([]);
  });
});

describe('claims guard positive controls (the guard is not vacuous)', () => {
  it.each([
    ['anonymity', 'Your payments stay anonymous.'],
    ['anonymity', 'GhostPay makes you untraceable on chain'],
    ['anonymous-payments', 'Send unlinkable payments to anyone'],
    ['audited', 'The contracts have been independently audited.'],
    ['mainnet', 'GhostPay is mainnet-ready'],
    ['mainnet', 'Mainnet is now enabled for EVM payments.'],
    ['verified-seller', 'Paying a verified seller'],
    ['refund-promise', 'If the payment fails you will be refunded'],
    ['refund-promise', 'Automatic refunds for expired invoices'],
    ['expiry-reversal', 'When the invoice expires the transfer is reversed'],
    ['expiry-reversal', 'An expired invoice automatically refunds the payer'],
    ['guarantee', 'Guaranteed privacy for every invoice'],
  ])('%s: detects "%s"', (id, text) => {
    expect(forbiddenClaims('fixture', text).some((problem) => problem.includes(`: ${id} `))).toBe(true);
  });

  it.each([
    'Timing friction only, not anonymity.',
    'It has not been audited.',
    'Test networks only until mainnets are enabled.',
    'A name is not verified merchant identity.',
    'It does not promise anonymity or automatic refunds.',
    'Expiry never reverses a transfer.',
    'An expired invoice cannot be cancelled on chain.',
    'This is a rough heuristic, not guaranteed privacy.',
  ])('accepts the negated or conditional form "%s"', (text) => {
    expect(forbiddenClaims('fixture', text)).toEqual([]);
  });

  it('flags a new mention, a reworded reviewed mention and a stale entry', () => {
    const reviewedText = 'It is an estimate, not a guarantee.';
    const reviewed: Record<string, Reviewed> = {
      'fixture.kept': { topics: ['guarantee'], fp: fingerprint(reviewedText), why: 'qualified estimate wording' },
      'fixture.edited': { topics: ['guarantee'], fp: fingerprint(reviewedText), why: 'qualified estimate wording' },
      'fixture.gone': { topics: ['refund'], fp: fingerprint('never refunded'), why: 'removed message fixture' },
    };
    const problems = unreviewedMentions({
      'fixture.kept': reviewedText,
      'fixture.edited': 'It is a guarantee.',
      'fixture.new': 'The buffer is refunded on request.',
      'fixture.plain': 'Nothing sensitive here.',
    }, reviewed);
    expect(problems).toHaveLength(3);
    expect(problems.find((p) => p.startsWith('fixture.edited:'))).toContain('wording changed since review');
    expect(problems.find((p) => p.startsWith('fixture.new:'))).toContain('unreviewed mention');
    expect(problems.find((p) => p.startsWith('fixture.gone:'))).toContain('stale review entry');
  });

  it('reads page text without markup, scripts or entities', () => {
    expect(pageText('<p>It&rsquo;s <b>not</b>&nbsp;audited</p><script>"has been audited"</script>')).toBe(" It's not audited ");
  });
});
