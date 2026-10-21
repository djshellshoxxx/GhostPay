import { analyze, chainOk, prepareSteps, type NStep } from './analyze.js';
import { CHAIN_RULES, matchRule, type RuleEnv } from './chainRules.js';
import { checkLayerShape, validateLayers, usedPurposes } from './layers.js';
import { OPTION_DEFAULTS, evaluateSelection } from './profile.js';
import type { Context, CtBackend, Issue, Pipeline, PipelineValidation, PoolRef, Selection } from './types.js';

const POOL_STEPS = ['pool.deposit', 'pool.exit', 'pay.from-pool'];

function earlierPoolOf(steps: readonly NStep[], index: number): PoolRef | null {
  for (let i = index - 1; i >= 0; i--) {
    const s = steps[i] as NStep;
    if (s.kind === 'pool.deposit') return s.params['pool'] as PoolRef;
  }
  return null;
}

/**
 * Projects the pipeline onto one profile-style option selection (chaining spec 5.3): folds every
 * step's projection and the layers. Two different non-default values for one option are returned as
 * clash issues (for example fresh-wallet and a sponsored payer mode).
 */
export function projectWithClashes(p: Pipeline): { selection: Selection; clashes: Issue[] } {
  const { steps } = prepareSteps(p.steps);
  const ctBackend: CtBackend =
    (steps.find((s) => s.kind === 'ct.wrap')?.params['backend'] as CtBackend | undefined) ??
    p.ctBackend ??
    'ct1-zama';
  const sel = new Map<string, { value: string; steps: number[] }>();
  const clashes: Issue[] = [];
  const analysis = analyze(p);
  const set = (k: string, v: string, idx: number): void => {
    const cur = sel.get(k);
    const def = OPTION_DEFAULTS[k];
    if (cur === undefined) sel.set(k, { value: v, steps: [idx] });
    else if (cur.value === v) cur.steps.push(idx);
    else if (cur.value === def) sel.set(k, { value: v, steps: [idx] });
    else if (v !== def) {
      clashes.push({
        severity: 'error',
        code: 'E_CONFLICT',
        key: 'privacy.err.conflict.optionClash',
        steps: [...cur.steps, idx].sort((a, b) => a - b),
        detail: k,
      });
      sel.set(k, { value: v, steps: [idx] });
    }
  };
  for (const st of steps) {
    const proj = st.def.project(st.params, {
      role: p.role,
      asset: p.asset,
      ctBackend,
      later: p.steps.slice(st.index + 1),
      earlierPool: earlierPoolOf(steps, st.index),
      input: analysis.views[st.index]?.inHolding ?? null,
    });
    for (const [k, v] of Object.entries(proj)) set(k, v, st.index);
  }
  const L = p.layers;
  const t = L.transport;
  const put = (k: string, v: string | undefined): void => {
    if (v !== undefined) sel.set(k, { value: v, steps: [] });
  };
  put('net.rpcProfile', t.rpc ?? 'direct');
  put('net.relayerProfile', t.relayer ?? 'direct');
  put('net.rpcMode', L.rpcMode);
  put('net.scanMode', L.scanMode);
  const selection: Record<string, string> = {};
  for (const k of [...sel.keys()].sort()) selection[k] = (sel.get(k) as { value: string }).value;
  return { selection, clashes };
}

/** Projection only; see {@link projectWithClashes}. */
export function projectToSelection(p: Pipeline): Selection {
  return projectWithClashes(p).selection;
}

const ACK = (name: string): string => `privacy.ack.${name}`;

function requiredAcksFor(steps: readonly NStep[]): Set<string> {
  const acks = new Set<string>();
  for (const s of steps) {
    if (POOL_STEPS.includes(s.kind)) acks.add(ACK('poolDisclosure'));
    if ((s.kind === 'pool.deposit' && s.params['pool'] === 'shielded-pool') || s.kind === 'pay.from-pool')
      acks.add(ACK('shieldedPoolTestnet'));
    if (s.kind === 'payer.fresh-wallet' || (s.kind === 'pay.submit' && s.params['payerMode'] !== 'direct'))
      acks.add(ACK('payerStillPublic'));
    if (
      s.kind === 'ct.wrap' ||
      s.kind === 'ct.sweep' ||
      (s.kind === 'recv.stealth' && s.params['origin'] === 'confidential-router')
    )
      acks.add(ACK('ctTrust'));
    if (s.kind === 'hops.forward') acks.add(ACK('hopsWeak'));
  }
  return acks;
}

function mergeIssues(all: readonly Issue[]): Issue[] {
  const withSteps = new Set(all.filter((i) => i.steps.length > 0).map((i) => `${i.code}|${i.key}`));
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const i of all) {
    if (i.steps.length === 0 && withSteps.has(`${i.code}|${i.key}`)) continue;
    const id = `${i.severity}|${i.code}|${i.key}|${i.ruleId ?? ''}|${i.detail ?? ''}|${i.steps.join(',')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(i);
  }
  const rank = { error: 0, ack: 1, warn: 2 } as const;
  return out.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.key.localeCompare(b.key) ||
      (a.ruleId ?? '').localeCompare(b.ruleId ?? '') ||
      (a.detail ?? '').localeCompare(b.detail ?? '') ||
      a.steps.join(',').localeCompare(b.steps.join(',')),
  );
}

/**
 * Validates a pipeline: structure, typing (T-1..T-4), chain rules, projection plus profile rules,
 * layers. Never throws; an unsupported chain returns a blocking `E_WRONG_CHAIN` issue.
 *
 * @security Testnet guard: any chain outside the allowed testnets blocks. Acks are never added here.
 * `ok` means no blocking issue; `requiredAcks` must still be covered by the user (PL-4).
 */
export function validate(p: Pipeline, ctx: Context): PipelineValidation {
  if (!chainOk(p)) {
    const wrong: Issue = {
      severity: 'error',
      code: 'E_WRONG_CHAIN',
      key: 'privacy.err.wrongChain',
      ruleId: 'R-01',
      steps: [],
    };
    return {
      ok: false,
      blocking: [wrong],
      warnings: [],
      requiredAcks: [],
      typeErrors: [],
      selection: {},
      endHolding: null,
    };
  }
  const a = analyze(p);
  const shape = checkLayerShape(p.layers);
  if (a.structural.length > 0 || shape.length > 0) {
    const blocking = mergeIssues([...a.structural, ...shape]);
    return {
      ok: false,
      blocking,
      warnings: [],
      requiredAcks: [],
      typeErrors: [],
      selection: {},
      endHolding: null,
    };
  }
  const issues: Issue[] = [...a.typeIssues];
  const env: RuleEnv = { views: a.views, invoiceGross: p.invoiceGross, testMode: ctx.testMode };
  for (const rule of CHAIN_RULES) {
    if ('layer' in rule.pattern || rule.effect === 'none' || rule.key === null) continue;
    const steps = matchRule(rule, env);
    if (steps.length === 0) continue;
    const severity = rule.effect === 'block' ? 'error' : rule.effect === 'ack' ? 'ack' : 'warn';
    issues.push({
      severity,
      code: severity === 'error' ? 'E_CHAIN_RULE' : severity === 'ack' ? 'ACK' : 'WARN',
      key: rule.key,
      ruleId: rule.id,
      steps,
    });
  }
  const { selection, clashes } = projectWithClashes(p);
  issues.push(...clashes);
  issues.push(...evaluateSelection(selection, ctx, p));
  issues.push(...validateLayers(p, ctx, usedPurposes(a.steps)));
  for (const k of requiredAcksFor(a.steps)) issues.push({ severity: 'ack', code: 'ACK', key: k, steps: [] });
  const merged = mergeIssues(issues);
  const blocking = merged.filter((i) => i.severity === 'error');
  const requiredAcks = [...new Set(merged.filter((i) => i.severity === 'ack').map((i) => i.key))].sort();
  return {
    ok: blocking.length === 0,
    blocking,
    warnings: merged.filter((i) => i.severity === 'warn'),
    requiredAcks,
    typeErrors: blocking.filter((i) => i.code === 'E_TYPE' || i.code === 'E_PARAM'),
    selection,
    endHolding:
      a.outHoldings.length > 0
        ? (a.outHoldings[a.outHoldings.length - 1] as PipelineValidation['endHolding'])
        : null,
  };
}
