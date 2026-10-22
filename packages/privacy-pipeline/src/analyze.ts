import { isTestnetChain } from './guard.js';
import { STEP_CATALOGUE, isStepKind, normalizeParams, type StepDef } from './steps.js';
import type { Holding, HoldingPattern, Issue, Pipeline, Role, Step, StepKind, StepParams } from './types.js';
import type { StepView } from './chainRules.js';

/** A step with kind and parameters resolved against the catalogue. */
export interface NStep {
  readonly index: number;
  readonly kind: StepKind;
  readonly params: StepParams;
  readonly def: StepDef;
}

export interface Analysis {
  readonly steps: readonly NStep[];
  /** Structural issues (unknown kinds, bad parameters). Non-empty means analysis is partial. */
  readonly structural: readonly Issue[];
  readonly typeIssues: readonly Issue[];
  readonly views: readonly StepView[];
  readonly outHoldings: readonly Holding[];
  /** Lineage count after the last step. */
  readonly lineages: number;
  readonly fans: readonly number[];
}

const err = (code: Issue['code'], key: string, steps: readonly number[], detail?: string): Issue => ({
  severity: 'error',
  code,
  key,
  steps,
  ...(detail === undefined ? {} : { detail }),
});

/** Structural match of a holding against a pattern (T-1). */
export function holdingMatches(h: Holding, pat: HoldingPattern): boolean {
  if (h.t !== pat.t) return false;
  const rec = h as unknown as Record<string, unknown>;
  for (const f of ['asset', 'origin', 'holder', 'wallet', 'kind', 'pool'] as const) {
    const allowed = pat[f];
    if (allowed !== undefined) {
      const v = rec[f];
      if (typeof v !== 'string' || !allowed.includes(v)) return false;
    }
  }
  return true;
}

/** Resolves kinds and parameters. Unknown kinds or parameters are structural errors (fail closed). */
export function prepareSteps(steps: readonly Step[]): { steps: NStep[]; structural: Issue[] } {
  const out: NStep[] = [];
  const structural: Issue[] = [];
  const probe: unknown = steps;
  if (!Array.isArray(probe))
    return { steps: out, structural: [err('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [], 'steps')] };
  steps.forEach((s, index) => {
    if (typeof s !== 'object' || s === null || !isStepKind((s as { kind: unknown }).kind)) {
      structural.push(err('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [index], 'kind'));
      return;
    }
    const def = STEP_CATALOGUE[s.kind];
    const rawParams = s.params;
    if (
      rawParams !== undefined &&
      (typeof rawParams !== 'object' || rawParams === null || Array.isArray(rawParams))
    ) {
      structural.push(err('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [index], 'params'));
      return;
    }
    const { params, errors } = normalizeParams(s.kind, rawParams);
    for (const e of errors) structural.push(err('E_UNKNOWN_VALUE', 'privacy.err.unknownValue', [index], e));
    out.push({ index, kind: s.kind, params, def });
  });
  return { steps: out, structural };
}

/**
 * Typing walk (T-1..T-4): computes the holding after each step, lineage counts and type issues.
 * Total over structurally valid steps; keeps walking after a mismatch so later rules still see a holding.
 */
export function analyze(p: Pipeline): Analysis {
  const { steps, structural } = prepareSteps(p.steps);
  const typeIssues: Issue[] = [];
  const views: StepView[] = [];
  const outHoldings: Holding[] = [];
  const fans: number[] = [];
  let holding: Holding | null = null;
  let lineages = 1;
  const family = p.chain.family;
  const role: Role = p.role;
  const pc = { role, asset: p.asset };
  if ((family === 'btc') !== (p.asset === 'btc'))
    typeIssues.push(err('E_TYPE', 'privacy.err.chain.crossChain', [], 'asset'));
  for (const st of steps) {
    const { def, index } = st;
    if (def.family !== family) typeIssues.push(err('E_TYPE', 'privacy.err.chain.crossChain', [index]));
    if (def.role !== 'both' && def.role !== role)
      typeIssues.push(err('E_TYPE', 'privacy.err.chain.typeMismatch', [index], 'role'));
    if (index === 0) {
      if (!def.start) typeIssues.push(err('E_TYPE', 'privacy.err.chain.typeMismatch', [index], 'start'));
    } else if (holding === null) {
      typeIssues.push(err('E_TYPE', 'privacy.err.chain.typeMismatch', [index], 'input'));
    } else if (holding.t === 'owned' || holding.t === 'paid') {
      typeIssues.push(err('E_TYPE', 'privacy.err.chain.typeMismatch', [index], 'terminal'));
    } else if (!def.accepts.some((a) => holdingMatches(holding as Holding, a))) {
      typeIssues.push(err('E_TYPE', 'privacy.err.chain.typeMismatch', [index], 'input'));
    }
    for (const bad of def.paramCheck?.(st.params, pc) ?? [])
      typeIssues.push(err('E_PARAM', 'privacy.err.chain.badParam', [index], bad));
    views.push({ index, kind: st.kind, params: st.params, inHolding: holding, lineages });
    const out = def.produce(st.params, holding, pc);
    const fan = def.fan(st.params, holding);
    fans.push(fan);
    lineages *= fan;
    holding = out;
    outHoldings.push(out);
  }
  return { steps, structural, typeIssues, views, outHoldings, lineages, fans };
}

/** True when the chain is an allowed testnet (exported for the validator's early exit). */
export function chainOk(p: Pipeline): boolean {
  return isTestnetChain(p.chain);
}
