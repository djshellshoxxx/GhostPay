import { analyze } from './analyze.js';
import type { Holding, Issue, Pipeline } from './types.js';

const e = (code: Issue['code'], key: string, detail: string): Issue => ({
  severity: 'error',
  code,
  key,
  steps: [],
  detail,
});

/**
 * Checks a payer pipeline against the seller pipeline that receives it (chaining spec 3.1): same chain,
 * origin and asset at the payment edge, one BTC mode per payment, and C-31 (payer pool exit then seller
 * deposit into the same pool, a warning only).
 *
 * @security Pure; does not validate each pipeline (call `validate` on both).
 */
export function checkJoin(payer: Pipeline, seller: Pipeline): readonly Issue[] {
  const out: Issue[] = [];
  if (payer.role !== 'payer' || seller.role !== 'seller')
    return [e('E_TYPE', 'privacy.err.chain.typeMismatch', 'role')];
  if (JSON.stringify(payer.chain) !== JSON.stringify(seller.chain))
    out.push(e('E_TYPE', 'privacy.err.chain.crossChain', 'chain'));
  const pa = analyze(payer);
  const sa = analyze(seller);
  if (pa.structural.length > 0 || sa.structural.length > 0)
    return [...out, e('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', 'structure')];
  const last = payer.steps.length === 0 ? undefined : pa.steps[pa.steps.length - 1];
  const first = sa.steps[0];
  if (last === undefined || (pa.outHoldings[pa.outHoldings.length - 1] as Holding).t !== 'paid') {
    out.push(e('E_TYPE', 'privacy.err.chain.typeMismatch', 'payer-not-paid'));
  } else if (first !== undefined) {
    if (last.kind === 'btc.send') {
      if (first.kind !== 'btc.recv' || first.params['mode'] !== last.params['mode'])
        out.push(e('E_CONFLICT', 'privacy.err.chain.typeMismatch', 'btc.mode'));
    } else {
      const inH = pa.views[last.index]?.inHolding;
      const confidential =
        inH !== null && inH !== undefined && 'asset' in inH && inH.asset === 'confidential';
      const origin = last.kind === 'pay.from-pool' ? 'pool' : confidential ? 'confidential-router' : 'router';
      if (first.kind !== 'recv.stealth' || first.params['origin'] !== origin)
        out.push(e('E_TYPE', 'privacy.err.chain.typeMismatch', 'origin'));
      const paidAsset = inH !== null && inH !== undefined && 'asset' in inH ? inH.asset : undefined;
      if (paidAsset !== undefined && paidAsset !== seller.asset)
        out.push(e('E_TYPE', 'privacy.err.chain.typeMismatch', 'asset'));
    }
  }
  const fromPool = payer.steps.some((s) => s.kind === 'pay.from-pool');
  const sellerPools = sa.steps.filter((s) => s.kind === 'pool.deposit').map((s) => s.params['pool']);
  const payerPools = pa.steps.filter((s) => s.kind === 'pool.deposit').map((s) => s.params['pool']);
  if (fromPool && sellerPools.some((x) => payerPools.includes(x))) {
    out.push({
      severity: 'warn',
      code: 'WARN',
      key: 'privacy.warn.amountTimingMatch',
      ruleId: 'C-31',
      steps: [],
    });
  }
  return out;
}
