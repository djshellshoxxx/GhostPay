import { CT_MIN_DWELL_MS } from './steps.js';
import type { Holding, ParamValue, StepKind, StepParams } from './types.js';

export type Relation = 'valid' | 'redundant' | 'harmful' | 'impossible';
export type Effect = 'none' | 'warn' | 'ack' | 'block';

/** Predicate over one step instance view. Pure data; interpreted by {@link evalPred}. */
export type ParamPred =
  | { readonly p: string; readonly in: readonly ParamValue[] }
  | { readonly p: string; readonly gt: number }
  | { readonly p: string; readonly lt: number }
  | { readonly p: string; readonly eqInvoiceGross: true }
  | { readonly holdingAsset: readonly string[] }
  | { readonly testMode: boolean }
  | { readonly lineagesGt: number }
  | { readonly all: readonly ParamPred[] }
  | { readonly any: readonly ParamPred[] }
  | { readonly not: ParamPred };

export interface StepMatch {
  readonly kind: StepKind | readonly StepKind[];
  readonly where?: ParamPred;
}

export type ChainPattern =
  | { readonly before: readonly [StepMatch, StepMatch]; readonly adjacent?: boolean }
  | { readonly after: StepMatch; readonly any: true }
  | { readonly repeat: StepMatch; readonly min: number; readonly distinct?: string }
  | { readonly with: StepMatch }
  | { readonly layer: 'relayLikeDirect' };

export interface ChainRuleDef {
  readonly id: string;
  readonly relation: Relation;
  readonly pattern: ChainPattern;
  readonly effect: Effect;
  /** Message key; null when the rule is informational (`effect: 'none'`). */
  readonly key: string | null;
  /** Profile rule this refines; both must agree or this one is stricter (PL-7). */
  readonly profileRule?: string;
  readonly specRef: { readonly file: string; readonly ids: readonly string[] } | 'new';
  /** Rule row is marked [new] in the spec or added by this build; goes to owner review. */
  readonly isNew: boolean;
}

/** View of one step used by the matcher. */
export interface StepView {
  readonly index: number;
  readonly kind: StepKind;
  readonly params: StepParams;
  readonly inHolding: Holding | null;
  /** Lineages entering this step. */
  readonly lineages: number;
}

export interface RuleEnv {
  readonly views: readonly StepView[];
  readonly invoiceGross: string | undefined;
  readonly testMode: boolean;
}

/** Evaluates a predicate against one step view. A missing parameter never matches `in`, `gt`, `lt`. */
export function evalPred(pred: ParamPred, v: StepView, env: RuleEnv): boolean {
  if ('all' in pred) return pred.all.every((x) => evalPred(x, v, env));
  if ('any' in pred) return pred.any.some((x) => evalPred(x, v, env));
  if ('not' in pred) return !evalPred(pred.not, v, env);
  if ('holdingAsset' in pred) {
    const h = v.inHolding;
    return h !== null && 'asset' in h && pred.holdingAsset.includes(h.asset);
  }
  if ('testMode' in pred) return env.testMode === pred.testMode;
  if ('lineagesGt' in pred) return v.lineages > pred.lineagesGt;
  const val = Object.prototype.hasOwnProperty.call(v.params, pred.p) ? v.params[pred.p] : undefined;
  if (val === undefined) return false;
  if ('in' in pred) return pred.in.includes(val);
  if ('gt' in pred) return typeof val === 'number' && val > pred.gt;
  if ('lt' in pred) return typeof val === 'number' && val < pred.lt;
  return typeof val === 'string' && val !== '' && env.invoiceGross !== undefined && val === env.invoiceGross;
}

function kindMatches(m: StepMatch, v: StepView, env: RuleEnv): boolean {
  const kinds = typeof m.kind === 'string' ? [m.kind] : m.kind;
  if (!kinds.includes(v.kind)) return false;
  return m.where === undefined || evalPred(m.where, v, env);
}

/**
 * Returns the step indices a rule matches (ascending, de-duplicated), or an empty array.
 * `layer` patterns are evaluated by the validator, not here.
 */
export function matchRule(rule: ChainRuleDef, env: RuleEnv): readonly number[] {
  const pat = rule.pattern;
  const hit = new Set<number>();
  const views = env.views;
  if ('before' in pat) {
    const [a, b] = pat.before;
    for (const va of views) {
      if (!kindMatches(a, va, env)) continue;
      for (const vb of views) {
        if (vb.index <= va.index) continue;
        if (pat.adjacent === true && vb.index !== va.index + 1) continue;
        if (kindMatches(b, vb, env)) {
          hit.add(va.index);
          hit.add(vb.index);
        }
      }
    }
  } else if ('after' in pat) {
    for (const va of views) {
      if (!kindMatches(pat.after, va, env)) continue;
      const later = views.filter((vb) => vb.index > va.index);
      if (later.length === 0) continue;
      hit.add(va.index);
      for (const vb of later) hit.add(vb.index);
    }
  } else if ('repeat' in pat) {
    const ms = views.filter((v) => kindMatches(pat.repeat, v, env));
    const distinct =
      pat.distinct === undefined
        ? ms.length
        : new Set(ms.map((v) => String(v.params[pat.distinct as string]))).size;
    if (ms.length >= pat.min && distinct >= pat.min) for (const v of ms) hit.add(v.index);
  } else if ('with' in pat) {
    for (const v of views) if (kindMatches(pat.with, v, env)) hit.add(v.index);
  }
  return [...hit].sort((x, y) => x - y);
}

const SPONSORED = ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'] as const;
const PAYJOIN = ['payjoin-v1', 'payjoin-v2'] as const;
const sp = (file: string, ...ids: string[]): { file: string; ids: readonly string[] } => ({ file, ids });

/**
 * Normative chain rules C-01..C-35 as data (chaining spec section 4). Rows added by this build beyond
 * the spec table carry ids with a suffix and `isNew: true`.
 *
 * C-21 (split parts swept per lineage) and C-31 (payer pool exit then seller deposit) join two roles and
 * are checked by `checkJoin`; C-32 is a layer rule. C-33 is type T-4.
 */
export const CHAIN_RULES: readonly ChainRuleDef[] = [
  {
    id: 'C-01',
    relation: 'redundant',
    pattern: {
      before: [{ kind: 'hops.forward', where: { not: { p: 'hops', gt: 2 } } }, { kind: 'pool.deposit' }],
    },
    effect: 'warn',
    key: 'privacy.warn.hopsBeforePoolNoGain',
    profileRule: 'R-08',
    specRef: sp('hops.md', 'HOP-POOL-1', 'HOP-POOL-2'),
    isNew: false,
  },
  {
    id: 'C-02',
    relation: 'impossible',
    pattern: { before: [{ kind: 'hops.forward', where: { p: 'hops', gt: 2 } }, { kind: 'pool.deposit' }] },
    effect: 'block',
    key: 'privacy.err.conflict.hopsPoolMax2',
    profileRule: 'R-09',
    specRef: sp('hops.md', 'HOP-POOL-1'),
    isNew: false,
  },
  {
    id: 'C-03',
    relation: 'impossible',
    pattern: { after: { kind: 'pool.exit' }, any: true },
    effect: 'block',
    key: 'privacy.err.chain.afterPoolExit',
    specRef: sp('hops.md', 'HOP-POOL-3'),
    isNew: false,
  },
  {
    id: 'C-04',
    relation: 'impossible',
    pattern: { before: [{ kind: 'hygiene.sweep' }, { kind: 'pool.deposit' }] },
    effect: 'block',
    key: 'privacy.err.chain.typeMismatch',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-05',
    relation: 'valid',
    pattern: { before: [{ kind: 'hops.forward' }, { kind: 'hygiene.sweep' }] },
    effect: 'ack',
    key: 'privacy.ack.hopsWeak',
    profileRule: 'R-04',
    specRef: sp('hops.md', 'HOP-REQ-1'),
    isNew: false,
  },
  {
    id: 'C-06',
    relation: 'redundant',
    pattern: { before: [{ kind: 'sweep.delay' }, { kind: 'pool.deposit' }] },
    effect: 'warn',
    key: 'privacy.warn.chain.creditZero',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-07',
    relation: 'impossible',
    pattern: { repeat: { kind: 'pool.deposit' }, min: 2 },
    effect: 'block',
    key: 'privacy.err.chain.repool',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-08',
    relation: 'valid',
    pattern: { before: [{ kind: 'payer.fresh-wallet' }, { kind: 'pool.deposit' }] },
    effect: 'warn',
    key: 'privacy.warn.tokenFundingLink',
    specRef: sp('payer-hiding.md', 'PH-1'),
    isNew: false,
  },
  {
    id: 'C-09',
    relation: 'impossible',
    pattern: { with: { kind: 'pool.deposit', where: { p: 'payerSponsor', in: ['permit-relay'] } } },
    effect: 'block',
    key: 'privacy.err.conflict.poolDepositSponsored',
    specRef: sp('payer-hiding.md', 'PH-2'),
    isNew: false,
  },
  {
    id: 'C-10',
    relation: 'impossible',
    pattern: {
      before: [
        { kind: 'amount.shape', where: { p: 'mode', in: ['round', 'split', 'denom'] } },
        { kind: 'pay.from-pool' },
      ],
      adjacent: true,
    },
    effect: 'block',
    key: 'privacy.err.conflict.poolPayBlur',
    profileRule: 'R-18',
    specRef: sp('shielded-pool.md', 'SP-PAY'),
    isNew: false,
  },
  {
    id: 'C-10-fan',
    relation: 'harmful',
    pattern: { before: [{ kind: 'pool.deposit', where: { p: 'n', gt: 1 } }, { kind: 'pay.from-pool' }] },
    effect: 'warn',
    key: 'privacy.warn.fanOutLinkable',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-11',
    relation: 'valid',
    pattern: {
      before: [{ kind: 'amount.shape', where: { p: 'mode', in: ['denom'] } }, { kind: 'pool.deposit' }],
    },
    effect: 'none',
    key: null,
    specRef: sp('amount-blurring.md', 'AB-DENOM'),
    isNew: false,
  },
  {
    id: 'C-12',
    relation: 'impossible',
    pattern: { with: { kind: 'pay.from-pool', where: { not: { p: 'payerMode', in: ['direct'] } } } },
    effect: 'block',
    key: 'privacy.err.conflict.poolPayPayerMode',
    profileRule: 'R-17',
    specRef: sp('shielded-pool.md', 'SP-PAY'),
    isNew: false,
  },
  {
    id: 'C-13',
    relation: 'impossible',
    pattern: {
      before: [
        { kind: 'recv.stealth', where: { p: 'origin', in: ['confidential-router'] } },
        { kind: ['pool.deposit', 'hops.forward', 'hygiene.sweep'] },
      ],
    },
    effect: 'block',
    key: 'privacy.err.chain.ctToPool',
    profileRule: 'R-11',
    specRef: sp('confidential-tokens.md', 'CT-DEC-2'),
    isNew: false,
  },
  {
    id: 'C-13-unwrap',
    relation: 'impossible',
    pattern: { before: [{ kind: 'ct.unwrap' }, { kind: 'pool.deposit' }] },
    effect: 'block',
    key: 'privacy.err.chain.ctToPool',
    profileRule: 'R-11',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-14',
    relation: 'harmful',
    pattern: { with: { kind: 'ct.unwrap' } },
    effect: 'ack',
    key: 'privacy.ack.ctUnwrapPublic',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-15',
    relation: 'harmful',
    pattern: {
      before: [{ kind: 'ct.wrap', where: { p: 'dwellMs', lt: CT_MIN_DWELL_MS } }, { kind: 'pay.submit' }],
    },
    effect: 'warn',
    key: 'privacy.warn.wrapUnwrapPublic',
    specRef: sp('confidential-tokens.md', 'CT-UX-4'),
    isNew: false,
  },
  {
    id: 'C-15-eq',
    relation: 'harmful',
    pattern: {
      before: [{ kind: 'ct.wrap', where: { p: 'amount', eqInvoiceGross: true } }, { kind: 'pay.submit' }],
    },
    effect: 'block',
    key: 'privacy.err.chain.wrapEqualsInvoice',
    specRef: sp('confidential-tokens.md', 'CT-UX-4'),
    isNew: false,
  },
  {
    id: 'C-16',
    relation: 'impossible',
    pattern: {
      before: [
        { kind: 'ct.wrap' },
        { kind: 'pay.submit', where: { not: { p: 'payerMode', in: ['direct'] } } },
      ],
    },
    effect: 'block',
    key: 'privacy.err.conflict.ctPayerMode',
    profileRule: 'R-12',
    specRef: sp('payer-hiding.md', 'PH-2'),
    isNew: false,
  },
  {
    id: 'C-17',
    relation: 'impossible',
    pattern: {
      with: {
        kind: 'pay.submit',
        where: {
          all: [{ p: 'route', in: ['direct-no-fee', 'accrual'] }, { holdingAsset: ['confidential'] }],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.conflict.ctDirectPay',
    profileRule: 'R-16',
    specRef: sp('confidential-tokens.md', 'CT-DEC-2'),
    isNew: true,
  },
  {
    id: 'C-18',
    relation: 'impossible',
    pattern: {
      with: {
        kind: 'amount.shape',
        where: { all: [{ p: 'mode', in: ['split', 'denom'] }, { holdingAsset: ['confidential'] }] },
      },
    },
    effect: 'block',
    key: 'privacy.err.conflict.ctSplit',
    profileRule: 'R-14',
    specRef: sp('profiles.md', 'R-14'),
    isNew: false,
  },
  {
    id: 'C-19',
    relation: 'redundant',
    pattern: {
      with: {
        kind: 'amount.shape',
        where: {
          all: [
            {
              any: [
                { p: 'mode', in: ['round'] },
                { p: 'noise', in: [true] },
              ],
            },
            { holdingAsset: ['confidential'] },
          ],
        },
      },
    },
    effect: 'warn',
    key: 'privacy.warn.mootCombination',
    profileRule: 'R-15',
    specRef: sp('profiles.md', 'R-15'),
    isNew: false,
  },
  {
    id: 'C-20',
    relation: 'harmful',
    pattern: {
      before: [
        { kind: 'amount.shape', where: { p: 'mode', in: ['split', 'denom'] } },
        { kind: 'pay.submit', where: { p: 'payerMode', in: SPONSORED } },
      ],
    },
    effect: 'warn',
    key: 'privacy.warn.sponsorSeesAllParts',
    profileRule: 'R-32',
    specRef: sp('amount-blurring.md', 'AB-SPLIT'),
    isNew: false,
  },
  {
    id: 'C-22',
    relation: 'impossible',
    pattern: {
      with: {
        kind: 'pay.submit',
        where: {
          all: [
            { p: 'route', in: ['direct-no-fee'] },
            { p: 'payerMode', in: SPONSORED },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.conflict.directPaySponsored',
    profileRule: 'R-20',
    specRef: sp('metadata-hardening.md', 'MH-FEE-1'),
    isNew: false,
  },
  {
    id: 'C-23',
    relation: 'impossible',
    pattern: {
      with: {
        kind: ['btc.send', 'btc.recv'],
        where: {
          all: [
            { p: 'mode', in: PAYJOIN },
            { p: 'silentPaymentOutput', in: [true] },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.chain.payjoinSp',
    specRef: sp('btc-payjoin.md', 'BPJ-SP-1', 'BPJ-URI-2'),
    isNew: false,
  },
  {
    id: 'C-24',
    relation: 'valid',
    pattern: {
      before: [
        { kind: 'btc.recv', where: { p: 'mode', in: ['silent-payment'] } },
        { kind: 'btc.payjoin-contribute' },
      ],
    },
    effect: 'none',
    key: null,
    specRef: sp('btc-payjoin.md', 'BPJ-RCV-9'),
    isNew: false,
  },
  {
    id: 'C-25',
    relation: 'impossible',
    pattern: {
      with: {
        kind: 'btc.send',
        where: {
          all: [
            { p: 'mode', in: PAYJOIN },
            { p: 'locktime', in: ['height'] },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.conflict.locktimePayjoin',
    profileRule: 'R-36',
    specRef: sp('metadata-hardening.md', 'MH-BTC-3'),
    isNew: false,
  },
  {
    id: 'C-26',
    relation: 'impossible',
    pattern: {
      with: { kind: ['pool.exit', 'hygiene.sweep'], where: { p: 'destination', in: ['external-reuse'] } },
    },
    effect: 'block',
    key: 'privacy.err.conflict.poolReuseDestination',
    profileRule: 'R-10',
    specRef: sp('hygiene.md', 'HY-CON'),
    isNew: false,
  },
  {
    id: 'C-27',
    relation: 'harmful',
    pattern: { with: { kind: 'pool.exit', where: { p: 'poolSubmit', in: ['self'] } } },
    effect: 'warn',
    key: 'privacy.warn.gasFundingLink',
    specRef: sp('shielded-pool.md', 'SP-EXIT'),
    isNew: false,
  },
  {
    id: 'C-28',
    relation: 'impossible',
    pattern: {
      with: {
        kind: 'pool.deposit',
        where: {
          all: [
            { p: 'pool', in: ['privacy-pools'] },
            { p: 'exitGas', in: ['permit-sponsored'] },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.conflict.ppDepositorMustBeS1',
    profileRule: 'R-34',
    specRef: sp('external-pools.md', 'EP-LINT-1'),
    isNew: false,
  },
  {
    id: 'C-29',
    relation: 'impossible',
    pattern: {
      with: {
        kind: ['pool.deposit', 'ct.wrap'],
        where: {
          all: [
            {
              any: [
                { p: 'pool', in: ['mock-pool'] },
                { p: 'backend', in: ['ctm-cleartext'] },
              ],
            },
            { testMode: false },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.testModeOnly',
    profileRule: 'R-03',
    specRef: sp('profiles.md', 'R-03'),
    isNew: false,
  },
  {
    id: 'C-30',
    relation: 'impossible',
    pattern: { with: { kind: 'hops.forward', where: { not: { holdingAsset: ['erc20-permit'] } } } },
    effect: 'block',
    key: 'privacy.err.hopsNoPermit',
    profileRule: 'R-07',
    specRef: sp('hops.md', 'NO_PERMIT'),
    isNew: false,
  },
  {
    id: 'C-32',
    relation: 'harmful',
    pattern: { layer: 'relayLikeDirect' },
    effect: 'warn',
    key: 'privacy.warn.networkDirectToParty',
    profileRule: 'R-31',
    specRef: sp('network-privacy.md', 'NP-T-5'),
    isNew: false,
  },
  {
    id: 'C-34',
    relation: 'redundant',
    pattern: { repeat: { kind: 'pool.deposit' }, min: 2, distinct: 'pool' },
    effect: 'warn',
    key: 'privacy.warn.chain.secondPoolNoGain',
    specRef: 'new',
    isNew: true,
  },
  {
    id: 'C-35',
    relation: 'impossible',
    pattern: {
      with: {
        kind: ['pool.exit', 'hygiene.sweep'],
        where: {
          all: [
            { p: 'destination', in: ['single-address'] },
            { any: [{ lineagesGt: 1 }, { p: 'partials', gt: 1 }] },
          ],
        },
      },
    },
    effect: 'block',
    key: 'privacy.err.chain.consolidation',
    specRef: sp('hygiene.md', 'HY-CON-1'),
    isNew: false,
  },
];
