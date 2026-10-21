import { analyze } from './analyze.js';
import { CHAIN_RULES, matchRule, type Relation, type RuleEnv } from './chainRules.js';
import { defaultLayers } from './build.js';
import type { AssetKind, Pipeline, Role, Step, StepKind } from './types.js';

export interface ChainMatrixCell {
  readonly before: StepKind;
  readonly after: StepKind;
  /** Strongest relation under default parameters, or `n/a` (type error or different role). */
  readonly relation: Relation | 'n/a';
  /** Chain rule ids (or `T-3`) behind the relation. */
  readonly rules: readonly string[];
}

export const MATRIX_ROWS: readonly StepKind[] = [
  'amount.shape',
  'payer.fresh-wallet',
  'ct.wrap',
  'sweep.delay',
  'hops.forward',
  'hygiene.sweep',
  'pool.deposit',
  'pool.exit',
];
export const MATRIX_COLS: readonly StepKind[] = [
  'hops.forward',
  'hygiene.sweep',
  'pool.deposit',
  'pool.exit',
  'ct.sweep',
  'pay.submit',
  'pay.from-pool',
];

const PREFIX: Partial<Record<StepKind, readonly Step[]>> = {
  'pool.exit': [{ kind: 'pool.deposit' }],
};
const ASSETS: readonly AssetKind[] = ['erc20-permit', 'erc20', 'confidential'];
const strength: Record<Relation, number> = { valid: 0, redundant: 1, harmful: 2, impossible: 3 };

function witness(role: Role, asset: AssetKind, row: StepKind, col: StepKind): Pipeline {
  const start: Step =
    role === 'payer'
      ? { kind: 'src.wallet' }
      : {
          kind: 'recv.stealth',
          params: { origin: asset === 'confidential' ? 'confidential-router' : 'router' },
        };
  return {
    v: 1,
    id: 'matrix',
    role,
    chain: { family: 'evm', chainId: 31337 },
    asset,
    steps: [start, ...(PREFIX[row] ?? []), { kind: row }, { kind: col }],
    layers: defaultLayers(),
  };
}

/**
 * Generated compatibility matrix for the compact table of chaining spec section 4: for each (before,
 * after) pair, the strongest chain-rule relation under default parameters over the witness
 * pipelines in which both steps type-check; `n/a` when no witness type-checks.
 */
export function chainMatrix(): readonly ChainMatrixCell[] {
  const cells: ChainMatrixCell[] = [];
  for (const row of MATRIX_ROWS) {
    for (const col of MATRIX_COLS) {
      let fallback: { rules: string[]; relation: Relation } | null = null;
      let found: ChainMatrixCell | null = null;
      for (const role of ['payer', 'seller'] as const) {
        for (const asset of ASSETS) {
          const p = witness(role, asset, row, col);
          const a = analyze(p);
          const ri = p.steps.length - 2;
          const ci = p.steps.length - 1;
          const at = (i: number): boolean => a.typeIssues.some((t) => t.steps.includes(i));
          const terminal = a.typeIssues.some((t) => t.steps.includes(ci) && t.detail === 'terminal');
          const env: RuleEnv = { views: a.views, invoiceGross: undefined, testMode: false };
          const hits = CHAIN_RULES.filter((r) => {
            if (r.effect === 'none' && r.key === null && !('before' in r.pattern)) return false;
            const m = matchRule(r, env);
            return m.includes(ri) && m.includes(ci);
          });
          const rules = hits.map((h) => h.id);
          let relation: Relation | null = hits.reduce<Relation | null>(
            (acc, h) => (acc === null || strength[h.relation] > strength[acc] ? h.relation : acc),
            null,
          );
          if (terminal) {
            relation = 'impossible';
            rules.unshift('T-3');
          }
          if (at(ri)) continue;
          if (relation !== null) {
            fallback ??= { rules, relation };
          }
          if (!at(ci) || terminal) {
            found = { before: row, after: col, relation: relation ?? 'valid', rules };
            break;
          }
        }
        if (found !== null) break;
      }
      cells.push(
        found ?? {
          before: row,
          after: col,
          relation: fallback?.relation ?? 'n/a',
          rules: fallback?.rules ?? [],
        },
      );
    }
  }
  return cells;
}
