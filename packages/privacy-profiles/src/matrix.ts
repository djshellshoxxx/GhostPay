/**
 * Compatibility matrix generated from the rules (never hand-written).
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { ALL_CAPABILITIES } from './keys.js';
import { evaluate } from './evaluate.js';
import { RULES } from './rules.js';
import type { Context, MatrixCell, OptionId, RuleId, Selection } from './types.js';

const DEFAULT_OPTIONS: readonly OptionId[] = [
  'pay.payerMode', 'pay.source', 'pay.amountVisibility', 'pay.amountBlur', 'pay.route', 'sweep.hops', 'sweep.exit', 'net.rpcProfile',
];

const MATRIX_CTX: Context = {
  action: 'settings',
  chainId: 11155111,
  env: 'web',
  asset: 'erc20-permit',
  capabilities: new Set(ALL_CAPABILITIES),
};

/** Relation of every pair of values of different options, evaluated with every capability present. */
export function compatibilityMatrix(opts?: { options?: readonly OptionId[] }): readonly MatrixCell[] {
  const options = opts?.options ?? DEFAULT_OPTIONS;
  const kinds = new Map(RULES.map((r) => [r.id, r.kind] as const));
  const out: MatrixCell[] = [];
  for (const oa of options) {
    for (const ob of options) {
      if (oa === ob) continue;
      for (const va of OPTION_CATALOGUE[oa].values) {
        for (const vb of OPTION_CATALOGUE[ob].values) {
          const sel: Selection = { preset: 'custom', values: { [oa]: va.value, [ob]: vb.value }, acks: [] };
          const ev = evaluate(sel, MATRIX_CTX);
          const ids = new Set<RuleId>();
          for (const i of [...ev.blocking, ...ev.warnings]) {
            if (!i.ruleId) continue;
            const both = i.ruleId !== 'R-31' && i.options.includes(oa) && i.options.includes(ob);
            const net = oa.startsWith('net.') || ob.startsWith('net.');
            const relay = i.ruleId === 'R-31' && net && (i.options.includes(oa) || i.options.includes(ob));
            if (both || relay) ids.add(i.ruleId);
          }
          const ks = [...ids].map((r) => kinds.get(r));
          const relation = ks.includes('conflict') ? 'conflict' : ks.includes('requires') ? 'requires' : ks.includes('moot') ? 'moot' : ks.includes('warn') ? 'warn' : 'ok';
          out.push({ a: { option: oa, value: va.value }, b: { option: ob, value: vb.value }, relation, ruleIds: [...ids].sort() });
        }
      }
    }
  }
  return out;
}
