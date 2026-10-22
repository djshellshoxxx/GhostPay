import { analyze } from './analyze.js';
import { PipelineError } from './errors.js';
import { assertTestnetChain } from './guard.js';
import { checkLayerShape } from './layers.js';
import { canonical, sha256Hex, type Hex } from './hash.js';
import type { Pipeline, PlanNode, PlanTree, QuoteMap } from './types.js';

/** Instance id: `sha256(pipelineId || lineagePath || stepIndex)` (EX-3). */
export function instanceIdOf(pipelineId: string, lineagePath: readonly number[], stepIndex: number): Hex {
  return sha256Hex(`${pipelineId}|${lineagePath.join('.')}|${stepIndex}`);
}

function requireStructure(p: Pipeline): ReturnType<typeof analyze> {
  assertTestnetChain(p.chain);
  const a = analyze(p);
  if (a.structural.length > 0 || checkLayerShape(p.layers).length > 0)
    throw new PipelineError('E_NOT_VALID', 'structure');
  return a;
}

/**
 * Expands a pipeline into its lineage tree. Pure and deterministic.
 *
 * @security Throws `E_WRONG_CHAIN` outside the allowed testnets, `E_NOT_VALID` for unknown kinds or
 * parameters. Type errors do not throw (the tree is best-effort); use `validate` before executing.
 */
export function expand(p: Pipeline): PlanTree {
  const a = requireStructure(p);
  let lineages: { path: readonly number[]; after: string | null }[] = [{ path: [], after: null }];
  const nodes: PlanNode[] = [];
  for (const st of a.steps) {
    const view = a.views[st.index];
    const fan = a.fans[st.index] as number;
    const out = a.outHoldings[st.index] as PlanNode['outHolding'];
    const next: { path: readonly number[]; after: string | null }[] = [];
    for (const l of lineages) {
      if (st.def.fanMode === 'outputs') {
        const id = instanceIdOf(p.id, l.path, st.index);
        nodes.push({
          instanceId: id,
          stepIndex: st.index,
          kind: st.kind,
          params: st.params,
          lineagePath: l.path,
          fan,
          after: l.after,
          inHolding: view?.inHolding ?? null,
          outHolding: out,
        });
        for (let j = 0; j < fan; j++) next.push({ path: fan === 1 ? l.path : [...l.path, j], after: id });
      } else {
        for (let j = 0; j < fan; j++) {
          const path = fan === 1 ? l.path : [...l.path, j];
          const id = instanceIdOf(p.id, path, st.index);
          nodes.push({
            instanceId: id,
            stepIndex: st.index,
            kind: st.kind,
            params: st.params,
            lineagePath: path,
            fan: 1,
            after: l.after,
            inHolding: view?.inHolding ?? null,
            outHolding: out,
          });
          next.push({ path, after: id });
        }
      }
    }
    lineages = next;
  }
  return { nodes, lineages: lineages.length };
}

/** Rounds up to two significant digits (plan hash input only). */
function roundUp2(n: bigint): bigint {
  const s = n.toString(10);
  if (s.length <= 2) return n;
  const unit = 10n ** BigInt(s.length - 2);
  return ((n + unit - 1n) / unit) * unit;
}

/**
 * Plan hash: `sha256(canonical(pipeline, layers, quotesRounded))` (spec 6.4). Parameters are
 * normalised first, so omitting a default and spelling it out hash alike.
 *
 * @security Throws `E_WRONG_CHAIN` outside the allowed testnets.
 */
export function planHash(p: Pipeline, quotes?: QuoteMap): Hex {
  const a = requireStructure(p);
  const q: Record<string, { feeBps: number; gasWeiMax: string }> = {};
  for (const k of Object.keys(quotes ?? {}).sort()) {
    const e = (quotes as QuoteMap)[k];
    if (e !== undefined)
      q[k] = { feeBps: Math.round(e.feeBps), gasWeiMax: roundUp2(e.gasWeiMax ?? 0n).toString(10) };
  }
  return sha256Hex(
    canonical({
      v: 1,
      id: p.id,
      role: p.role,
      chain: p.chain,
      asset: p.asset,
      ctBackend: p.ctBackend,
      invoiceGross: p.invoiceGross,
      steps: a.steps.map((s) => ({ kind: s.kind, params: s.params })),
      layers: p.layers,
      quotes: q,
    }),
  );
}
