/**
 * Ordering and composition rules for pipelines, as data (chaining spec section 4). Rows marked `'new'`
 * are not stated by any method spec and are listed in DEVIATIONS.md.
 * @security Chain rules only add ordering knowledge; each resolves to the stricter effect together with R-01..R-46.
 */
import type { AckKey, ErrorKey, OptionId, Pred, RuleId, SpecRef, WarningKey } from './types.js';
import type { StepKind } from './steps.js';

/** Parameter predicate. */
export type ParamPred =
  | { readonly p: string; readonly in: readonly (string | number)[] }
  | { readonly p: string; readonly gt: number }
  | { readonly p: string; readonly eqInvoiceGross: true }
  | { readonly all: readonly ParamPred[] }
  | { readonly any: readonly ParamPred[] }
  | { readonly not: ParamPred };
/** Step matcher. */
export interface StepMatch {
  readonly kind: StepKind | readonly StepKind[];
  readonly where?: ParamPred;
}
/** Pattern over a pipeline. */
export type ChainPattern =
  | { readonly before: readonly [StepMatch, StepMatch]; readonly adjacent?: boolean }
  | { readonly after: StepMatch; readonly any: true }
  | { readonly repeat: StepMatch; readonly min: number }
  | { readonly distinctLineages: StepMatch; readonly min: number }
  | { readonly with: StepMatch; readonly ctx: Pred }
  | { readonly joinOf: StepMatch }
  | { readonly mixedFamilies: true };
/** One chain rule. */
export interface ChainRuleDef {
  readonly id: `C-${string}`;
  readonly relation: 'valid' | 'redundant' | 'harmful' | 'impossible';
  readonly pattern: ChainPattern;
  readonly effect: 'none' | 'warn' | 'ack' | 'block';
  /** Escalation (C-15): when `where` holds on the second step, the effect becomes block with this key. */
  readonly escalate?: { readonly where: ParamPred; readonly key: ErrorKey };
  readonly key: WarningKey | ErrorKey | AckKey;
  readonly profileRule?: RuleId;
  readonly specRef: SpecRef | 'new';
}
/** One cell of the generated chain matrix. */
export interface ChainMatrixCell {
  readonly a: string;
  readonly b: string;
  readonly relation: ChainRuleDef['relation'];
  readonly ruleIds: readonly string[];
}

const ALWAYS: Pred = { all: [] };
const k = (kind: StepKind | readonly StepKind[], where?: ParamPred): StepMatch => (where ? { kind, where } : { kind });
const pin = (p: string, ...v: (string | number)[]): ParamPred => ({ p, in: v });
const e = (n: string): ErrorKey => `privacy.err.${n}`;
const w = (n: string): WarningKey => `privacy.warn.${n}`;
const r = (file: string, ...ids: string[]): SpecRef => ({ file, ids });
const SPONSORED = ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'];
const RELAY_KINDS: readonly StepKind[] = ['hops.forward', 'pool.exit', 'pay.from-pool', 'pool.deposit', 'pay.submit'];

/** C-01..C-35. */
export const CHAIN_RULES: readonly ChainRuleDef[] = [
  { id: 'C-01', relation: 'redundant', pattern: { before: [k('hops.forward', { not: { p: 'hops', gt: 2 } }), k('pool.deposit')] }, effect: 'warn', key: w('hopsBeforePoolNoGain'), profileRule: 'R-08', specRef: r('hops.md', 'HOP-POOL-1', 'HOP-POOL-2') },
  { id: 'C-02', relation: 'impossible', pattern: { before: [k('hops.forward', { p: 'hops', gt: 2 }), k('pool.deposit')] }, effect: 'block', key: e('conflict.hopsPoolMax2'), profileRule: 'R-09', specRef: r('hops.md', 'HOP-POOL-1') },
  { id: 'C-03', relation: 'impossible', pattern: { after: k('pool.exit'), any: true }, effect: 'block', key: e('chain.afterPoolExit'), specRef: r('hops.md', 'HOP-POOL-3') },
  { id: 'C-04', relation: 'impossible', pattern: { before: [k('hygiene.sweep'), k('pool.deposit')] }, effect: 'block', key: e('chain.typeMismatch'), specRef: 'new' },
  { id: 'C-05', relation: 'valid', pattern: { before: [k('hops.forward'), k('hygiene.sweep')] }, effect: 'ack', key: 'privacy.ack.hopsWeak', profileRule: 'R-04', specRef: r('hops.md', 'HOP-REQ-1') },
  { id: 'C-06', relation: 'redundant', pattern: { before: [k('sweep.delay'), k('pool.deposit')] }, effect: 'warn', key: w('chain.creditZero'), specRef: 'new' },
  { id: 'C-07', relation: 'impossible', pattern: { repeat: k('pool.deposit'), min: 2 }, effect: 'block', key: e('chain.repool'), specRef: 'new' },
  { id: 'C-08', relation: 'valid', pattern: { before: [k('payer.fresh-wallet'), k('pool.deposit')] }, effect: 'warn', key: w('tokenFundingLink'), specRef: r('payer-hiding.md', 'PH-1') },
  { id: 'C-09', relation: 'impossible', pattern: { with: k('pool.deposit', pin('payerMode', 'permit-relay')), ctx: ALWAYS }, effect: 'block', key: e('conflict.poolPayPayerMode'), specRef: r('payer-hiding.md', 'PH-2') },
  { id: 'C-10', relation: 'impossible', pattern: { before: [k('amount.shape', pin('mode', 'split', 'denom', 'round')), k('pay.from-pool')] }, effect: 'block', key: e('conflict.poolPayBlur'), profileRule: 'R-18', specRef: r('shielded-pool.md', 'SP-PAY') },
  { id: 'C-11', relation: 'valid', pattern: { before: [k('amount.shape', pin('mode', 'denom')), k('pool.deposit')] }, effect: 'none', key: w('amountTimingMatch'), specRef: r('shielded-pool.md', 'SP-SDK-8') },
  { id: 'C-12', relation: 'impossible', pattern: { with: k('pay.from-pool'), ctx: { opt: 'pay.payerMode', notIn: ['direct'] } }, effect: 'block', key: e('conflict.poolPayPayerMode'), profileRule: 'R-17', specRef: r('shielded-pool.md', 'SP-PAY') },
  { id: 'C-13', relation: 'impossible', pattern: { with: k(['pool.deposit', 'hops.forward', 'hygiene.sweep']), ctx: { asset: ['confidential'] } }, effect: 'block', key: e('chain.ctToPool'), profileRule: 'R-11', specRef: r('confidential-tokens.md', 'CT-DEC-2') },
  { id: 'C-14', relation: 'harmful', pattern: { with: k('ct.unwrap'), ctx: ALWAYS }, effect: 'ack', key: 'privacy.ack.ctUnwrapPublic', specRef: 'new' },
  { id: 'C-15', relation: 'harmful', pattern: { before: [k('ct.wrap'), k('pay.submit')] }, effect: 'warn', escalate: { where: { p: 'wrapAmount', eqInvoiceGross: true }, key: e('chain.wrapEqualsGross') }, key: w('chain.amountContinuity'), specRef: r('confidential-tokens.md', 'CT-UX-4') },
  { id: 'C-16', relation: 'impossible', pattern: { before: [k('ct.wrap'), k('pay.submit', { not: pin('payerMode', 'direct') })] }, effect: 'block', key: e('conflict.ctPayerMode'), profileRule: 'R-12', specRef: 'new' },
  { id: 'C-17', relation: 'impossible', pattern: { with: k('pay.submit', pin('route', 'direct-no-fee', 'accrual')), ctx: { asset: ['confidential'] } }, effect: 'block', key: e('conflict.ctDirectPay'), profileRule: 'R-16', specRef: 'new' },
  { id: 'C-18', relation: 'impossible', pattern: { with: k('amount.shape', pin('mode', 'split', 'denom')), ctx: { opt: 'pay.amountVisibility', notIn: ['public'] } }, effect: 'block', key: e('conflict.ctSplit'), profileRule: 'R-14', specRef: 'new' },
  { id: 'C-19', relation: 'redundant', pattern: { with: k('amount.shape', { any: [pin('mode', 'round'), { p: 'noise', in: [1] }] }), ctx: { opt: 'pay.amountVisibility', notIn: ['public'] } }, effect: 'warn', key: w('mootCombination'), profileRule: 'R-15', specRef: 'new' },
  { id: 'C-20', relation: 'harmful', pattern: { before: [k('amount.shape', pin('mode', 'split', 'denom')), k('pay.submit', pin('payerMode', ...SPONSORED))] }, effect: 'warn', key: w('sponsorSeesAllParts'), profileRule: 'R-32', specRef: 'new' },
  { id: 'C-21', relation: 'valid', pattern: { before: [k('amount.shape', pin('mode', 'split')), k('hygiene.sweep')] }, effect: 'warn', key: w('fanOutLinkable'), specRef: r('amount-blurring.md', 'AB-SPLIT', 'HY-CON') },
  { id: 'C-22', relation: 'impossible', pattern: { with: k('pay.submit', { all: [pin('route', 'direct-no-fee'), pin('payerMode', ...SPONSORED)] }), ctx: ALWAYS }, effect: 'block', key: e('conflict.directPaySponsored'), profileRule: 'R-20', specRef: r('metadata-hardening.md', 'MH-FEE-1') },
  { id: 'C-23', relation: 'impossible', pattern: { with: k('btc.recv', { all: [pin('mode', 'silent-payment'), pin('payjoin', 'yes')] }), ctx: ALWAYS }, effect: 'block', key: e('chain.payjoinSp'), specRef: r('btc-payjoin.md', 'BPJ-SP-1', 'BPJ-URI-2') },
  { id: 'C-24', relation: 'valid', pattern: { before: [k('btc.recv', pin('mode', 'silent-payment')), k('btc.payjoin-contribute')] }, effect: 'warn', key: w('payjoinNoSilentPayment'), specRef: r('btc-payjoin.md', 'BPJ-RCV-9') },
  { id: 'C-25', relation: 'impossible', pattern: { with: k(['btc.send', 'btc.recv', 'btc.payjoin-contribute']), ctx: { all: [{ opt: 'btc.mode', in: ['payjoin-v1', 'payjoin-v2'] }, { opt: 'btc.locktime', in: ['height'] }] } }, effect: 'block', key: e('conflict.locktimePayjoin'), profileRule: 'R-36', specRef: r('metadata-hardening.md', 'MH-BTC-3') },
  { id: 'C-26', relation: 'impossible', pattern: { with: k(['pool.exit', 'hygiene.sweep'], pin('destination', 'external-reuse')), ctx: ALWAYS }, effect: 'block', key: e('conflict.poolReuseDestination'), profileRule: 'R-10', specRef: r('shielded-pool.md', 'SP-SDK-7') },
  { id: 'C-27', relation: 'harmful', pattern: { with: k('pool.exit', pin('poolSubmit', 'self')), ctx: ALWAYS }, effect: 'warn', key: w('gasFundingLink'), specRef: r('shielded-pool.md', 'SP-REL') },
  { id: 'C-28', relation: 'impossible', pattern: { with: k('pool.deposit', { all: [pin('pool', 'privacy-pools'), pin('gas', 'permit-sponsored')] }), ctx: ALWAYS }, effect: 'block', key: e('conflict.ppDepositorMustBeS1'), profileRule: 'R-34', specRef: r('external-pools.md', 'EP-PP-1') },
  { id: 'C-29', relation: 'impossible', pattern: { with: k(['pool.deposit', 'ct.wrap'], { any: [pin('pool', 'mock-pool'), pin('backend', 'ctm-cleartext')] }), ctx: { notCap: 'test-mode' } }, effect: 'block', key: e('testModeOnly'), profileRule: 'R-03', specRef: r('external-pools.md', 'EP-M') },
  { id: 'C-30', relation: 'impossible', pattern: { with: k('hops.forward'), ctx: { assetNot: ['erc20-permit'] } }, effect: 'block', key: e('hopsNoPermit'), profileRule: 'R-07', specRef: r('hops.md', 'HOP-RLY-1') },
  { id: 'C-31', relation: 'valid', pattern: { before: [k('pay.from-pool'), k('pool.deposit')] }, effect: 'warn', key: w('amountTimingMatch'), specRef: r('shielded-pool.md', 'SP-PAY') },
  { id: 'C-32', relation: 'harmful', pattern: { with: k(RELAY_KINDS), ctx: { opt: 'net.relayerProfile', in: ['direct'] } }, effect: 'warn', key: w('networkDirectToParty'), profileRule: 'R-31', specRef: r('security-specs/privacy-ops.md', 'PO-NET-1') },
  { id: 'C-33', relation: 'impossible', pattern: { mixedFamilies: true }, effect: 'block', key: e('chain.crossChain'), specRef: r('README.md', 'Watch') },
  { id: 'C-34', relation: 'redundant', pattern: { distinctLineages: k('pool.deposit'), min: 2 }, effect: 'warn', key: w('chain.secondPoolNoGain'), specRef: 'new' },
  { id: 'C-35', relation: 'impossible', pattern: { joinOf: k('pool.exit') }, effect: 'block', key: e('chain.consolidation'), specRef: r('shielded-pool.md', 'SP-SDK-7') },
];

const label = (m: StepMatch): string => (typeof m.kind === 'string' ? m.kind : m.kind.join('|'));

/** Matrix generated from the rules (one cell per rule that names a step pair or a single step). */
export function chainMatrix(): readonly ChainMatrixCell[] {
  const out: ChainMatrixCell[] = [];
  for (const rule of CHAIN_RULES) {
    const p = rule.pattern;
    let a = '*';
    let b = '*';
    if ('before' in p) {
      a = label(p.before[0]);
      b = label(p.before[1]);
    } else if ('after' in p) a = label(p.after);
    else if ('repeat' in p) a = b = label(p.repeat);
    else if ('distinctLineages' in p) a = b = label(p.distinctLineages);
    else if ('with' in p) a = label(p.with);
    else if ('joinOf' in p) a = label(p.joinOf);
    out.push({ a, b, relation: rule.relation, ruleIds: [rule.id] });
  }
  return out;
}

/** Option ids used by chain rules in `ctx` predicates (for tests). */
export type ChainCtxOption = OptionId;
