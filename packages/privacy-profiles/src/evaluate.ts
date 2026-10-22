/**
 * Selection evaluation: implicit per-value checks plus the rule table. Pure, synchronous and total.
 * @security A valid selection is not a private one. Capabilities are caller assertions and are never verified here.
 * @security Chain guard: any non-default option on a chain outside the testnet list is blocking (R-01).
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { RULES } from './rules.js';
import {
  ACK_KEYS,
} from './keys.js';
import { OPTION_IDS, TESTNET_BTC_NETWORKS, TESTNET_CHAIN_IDS } from './types.js';
import type {
  AckKey,
  Context,
  ErrorKey,
  Evaluation,
  Issue,
  IssueCode,
  LeakKey,
  OptionDef,
  OptionId,
  Pred,
  RuleDef,
  Selection,
  StrengthClass,
  TrustParty,
  ValueDef,
  WarningKey,
} from './types.js';

interface State {
  readonly sel: Selection;
  readonly ctx: Context;
  readonly vals: Record<OptionId, string>;
  readonly active: Record<OptionId, boolean>;
}

const RELAY_LIKE: ReadonlySet<TrustParty> = new Set<TrustParty>([
  'sweep-relayer', 'payer-sponsor', 'bundler', 'pool-relayer', 'railgun-broadcaster', 'zama-decrypt-relayer', 'payjoin-directory',
]);
const NOT_SELECTABLE: ErrorKey = 'privacy.err.notSelectable';
const UNKNOWN_VALUE: ErrorKey = 'privacy.err.unknownValue';
const WRONG_ASSET: ErrorKey = 'privacy.err.wrongAsset';

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Definition of the chosen value, if the option has it. */
export function valueDef(id: OptionId, value: string): ValueDef | undefined {
  return OPTION_CATALOGUE[id].values.find((v) => v.value === value);
}

function inScope(def: OptionDef, ctx: Context): boolean {
  return ctx.action === 'settings' || def.actions.includes(ctx.action);
}

function chainGuardFails(def: OptionDef, ctx: Context): boolean {
  if (ctx.action === 'btc-receive' || ctx.action === 'btc-send') {
    return !(typeof ctx.btcNetwork === 'string' && (TESTNET_BTC_NETWORKS as readonly string[]).includes(ctx.btcNetwork));
  }
  if (def.group === 'btc') {
    return ctx.btcNetwork != null && !(TESTNET_BTC_NETWORKS as readonly string[]).includes(ctx.btcNetwork);
  }
  if (ctx.chainId === null) return ctx.action !== 'settings';
  return !(TESTNET_CHAIN_IDS as readonly number[]).includes(ctx.chainId);
}

/** Trust parties of an applied value, including the pool submitter that the default `poolSubmit=relayer` implies. */
function trustOf(id: OptionId, vd: ValueDef, st: State): readonly TrustParty[] {
  if (id === 'sweep.exit' && st.vals['sweep.poolSubmit'] === 'relayer') {
    if (vd.value === 'shielded-pool') return [...vd.trust, 'pool-relayer'];
    if (vd.value === 'railgun') return [...vd.trust, 'railgun-broadcaster'];
  }
  return vd.trust;
}

function scanOptions(name: string, st: State): OptionId[] {
  const out: OptionId[] = [];
  const direct = st.vals['net.relayerProfile'] === 'direct';
  for (const id of OPTION_IDS) {
    const def = OPTION_CATALOGUE[id];
    const value = st.vals[id];
    if (!inScope(def, st.ctx) || value === def.defaultValue) continue;
    const vd = valueDef(id, value);
    if (!vd) continue;
    const applies = st.active[id];
    switch (name) {
      case 'chain':
        if (def.userSelectable && chainGuardFails(def, st.ctx)) out.push(id);
        break;
      case 'maturity-unavailable':
        if (vd.maturity === 'stub' || vd.maturity === 'watch') out.push(id);
        break;
      case 'maturity-test-only':
        if (vd.maturity === 'test-only' && !st.ctx.capabilities.has('test-mode')) out.push(id);
        break;
      case 'maturity-experimental':
        if (applies && vd.maturity === 'experimental') out.push(id);
        break;
      case 'env':
        if (def.group === 'network' && vd.env && !vd.env.includes(st.ctx.env)) out.push(id);
        break;
      case 'selftest':
        if (id === 'net.rpcProfile' && !st.ctx.capabilities.has('selftest-ok:rpc')) out.push(id);
        if (id === 'net.relayerProfile' && !st.ctx.capabilities.has('selftest-ok:relayer')) out.push(id);
        break;
      case 'relay-direct':
        if (direct && applies && trustOf(id, vd, st).some((t) => RELAY_LIKE.has(t))) out.push(id);
        break;
      default:
        break;
    }
  }
  return out;
}

function evalPred(p: Pred, st: State): boolean {
  if ('opt' in p) {
    const v = st.vals[p.opt];
    return 'in' in p ? p.in.includes(v) : !p.notIn.includes(v);
  }
  if ('cap' in p) return st.ctx.capabilities.has(p.cap);
  if ('notCap' in p) return !st.ctx.capabilities.has(p.notCap);
  if ('env' in p) return p.env.includes(st.ctx.env);
  if ('asset' in p) return st.ctx.asset !== undefined && p.asset.includes(st.ctx.asset);
  if ('assetNot' in p) return st.ctx.asset !== undefined && !p.assetNot.includes(st.ctx.asset);
  if ('action' in p) return p.action.includes(st.ctx.action);
  if ('ack' in p) return st.sel.acks.includes(p.ack);
  if ('scan' in p) return scanOptions(p.scan, st).length > 0;
  if ('all' in p) return p.all.every((q) => evalPred(q, st));
  if ('any' in p) return p.any.some((q) => evalPred(q, st));
  return !evalPred(p.not, st);
}

/** Options named by a predicate. */
export function predOptions(p: Pred, out: Set<OptionId> = new Set()): Set<OptionId> {
  if ('opt' in p) out.add(p.opt);
  else if ('all' in p) p.all.forEach((q) => predOptions(q, out));
  else if ('any' in p) p.any.forEach((q) => predOptions(q, out));
  else if ('not' in p) predOptions(p.not, out);
  return out;
}

const defaultIssueCode = (r: RuleDef): IssueCode =>
  r.kind === 'conflict' ? 'E_CONFLICT' : r.kind === 'requires' ? 'E_REQUIRES' : r.kind === 'moot' ? 'W_MOOT' : 'W_RULE';

const uniqSorted = <T extends string>(xs: Iterable<T>): T[] => [...new Set(xs)].sort();

function cmpIssue(a: Issue, b: Issue): number {
  const ka = `${a.code}|${a.key}|${a.options.join(',')}`;
  const kb = `${b.code}|${b.key}|${b.options.join(',')}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Evaluates a selection against a context.
 * @security Never throws; unknown options or values in `sel` become blocking issues and fall back to defaults.
 */
export function evaluate(sel: Selection, ctx: Context): Evaluation {
  const issues: Issue[] = [];
  const vals = {} as Record<OptionId, string>;
  const active = {} as Record<OptionId, boolean>;
  const rawValues: Readonly<Record<string, unknown>> = typeof sel.values === 'object' && sel.values !== null ? sel.values : {};
  for (const k of Object.keys(rawValues)) {
    if (!(OPTION_IDS as readonly string[]).includes(k)) issues.push({ code: 'E_UNKNOWN_VALUE', key: UNKNOWN_VALUE, options: [] });
  }
  for (const id of OPTION_IDS) {
    const def = OPTION_CATALOGUE[id];
    const raw = has(rawValues, id) ? rawValues[id] : undefined;
    vals[id] = def.defaultValue;
    if (raw === undefined) continue;
    if (typeof raw !== 'string' || !def.values.some((v) => v.value === raw)) {
      issues.push({ code: 'E_UNKNOWN_VALUE', key: UNKNOWN_VALUE, options: [id] });
    } else if (!def.userSelectable && raw !== def.defaultValue) {
      issues.push({ code: 'E_NOT_SELECTABLE', key: NOT_SELECTABLE, options: [id] });
    } else vals[id] = raw;
  }
  const st: State = { sel, ctx, vals, active };
  for (const id of OPTION_IDS) {
    const a = OPTION_CATALOGUE[id].activeWhen;
    active[id] = a === undefined ? true : evalPred(a, st);
  }

  // Rules first, so a rule key wins over the equivalent implicit key.
  for (const r of RULES) {
    let fired: boolean;
    let options: OptionId[];
    if ('scan' in r.when) {
      options = scanOptions(r.when.scan, st);
      fired = options.length > 0;
    } else {
      const inv = predOptions(r.when);
      if (r.then) predOptions(r.then, inv);
      options = [...inv].sort();
      const whenOk = evalPred(r.when, st);
      fired = r.kind === 'requires' ? whenOk && r.then !== undefined && !evalPred(r.then, st) : whenOk;
      if (fired && options.length > 0 && !options.some((o) => inScope(OPTION_CATALOGUE[o], ctx))) fired = false;
    }
    if (!fired) continue;
    issues.push({
      code: r.code ?? defaultIssueCode(r),
      key: r.key,
      options,
      ruleId: r.id,
      ...(r.specRef === 'new' ? {} : { specRef: r.specRef }),
    });
  }

  const trust: TrustParty[] = [];
  const hides: LeakKey[] = [];
  const dnh: LeakKey[] = [];
  const strength: StrengthClass[] = [];
  const copy: string[] = [];
  const acksNeeded = new Map<AckKey, OptionId[]>();
  for (const id of OPTION_IDS) {
    const def = OPTION_CATALOGUE[id];
    const value = vals[id];
    if (value === def.defaultValue || !inScope(def, ctx) || !active[id]) continue;
    const vd = valueDef(id, value);
    if (!vd) continue;
    for (const c of vd.requires) {
      if (c !== 'test-mode' && !ctx.capabilities.has(c)) {
        issues.push({ code: 'E_CAPABILITY', key: `privacy.err.requires.cap.${c}`, options: [id] });
      }
    }
    if (vd.requiresAny && !vd.requiresAny.some((c) => ctx.capabilities.has(c))) {
      for (const c of vd.requiresAny) issues.push({ code: 'E_CAPABILITY', key: `privacy.err.requires.cap.${c}`, options: [id] });
    }
    if (def.group !== 'network' && vd.env && !vd.env.includes(ctx.env)) {
      issues.push({ code: 'E_WRONG_ENV', key: 'privacy.err.wrongEnv', options: [id] });
    }
    if (vd.chains && ctx.chainId !== null && !(vd.chains as readonly number[]).includes(ctx.chainId)) {
      issues.push({ code: 'E_WRONG_CHAIN', key: 'privacy.err.wrongChain', options: [id] });
    }
    if (vd.assets && ctx.asset !== undefined && !vd.assets.includes(ctx.asset)) {
      issues.push({ code: 'E_WRONG_ASSET', key: WRONG_ASSET, options: [id] });
    }
    for (const w of vd.warnings) {
      if (w !== 'privacy.warn.testnetOnly') issues.push({ code: 'W_VALUE', key: w, options: [id] });
    }
    for (const a of vd.acks) acksNeeded.set(a, [...(acksNeeded.get(a) ?? []), id]);
    trust.push(...trustOf(id, vd, st));
    hides.push(...vd.hides);
    dnh.push(...vd.doesNotHide);
    strength.push(vd.strength);
    copy.push(...vd.specCopyKeys);
  }
  for (const [a, opts] of acksNeeded) {
    if (!sel.acks.includes(a)) {
      issues.push({ code: 'E_ACK_MISSING', key: `privacy.err.ackMissing.${a.slice('privacy.ack.'.length)}`, options: uniqSorted(opts) });
    }
  }
  issues.push({ code: 'W_VALUE', key: 'privacy.warn.testnetOnly', options: [] });

  const seen = new Set<string>();
  const dedup: Issue[] = [];
  for (const i of issues) {
    const k = `${i.code}|${i.key}|${i.options.join(',')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(i);
  }
  dedup.sort(cmpIssue);
  const blocking = dedup.filter((i) => i.code.startsWith('E_'));
  return {
    ok: blocking.length === 0,
    blocking,
    warnings: dedup.filter((i) => i.code.startsWith('W_')),
    requiredAcks: uniqSorted([...acksNeeded.keys()].filter((a) => (ACK_KEYS as readonly string[]).includes(a))),
    effective: vals,
    trust: uniqSorted(trust),
    hides: uniqSorted(hides),
    doesNotHide: uniqSorted(dnh),
    strength: uniqSorted(strength),
    specCopyKeys: uniqSorted(copy),
  };
}

/** Adds one extra blocking issue to an evaluation (used by option setters). */
export function withIssue(ev: Evaluation, issue: Issue): Evaluation {
  const blocking = [...ev.blocking, issue].sort(cmpIssue);
  return { ...ev, ok: false, blocking };
}

/**
 * Honest explanation rows: every option in scope with its effective value and definition, so the UI can render
 * trust parties, warnings and method-owned copy keys.
 */
export function explain(sel: Selection, ctx: Context): readonly { option: OptionId; value: string; def: ValueDef }[] {
  const ev = evaluate(sel, ctx);
  const out: { option: OptionId; value: string; def: ValueDef }[] = [];
  for (const id of OPTION_IDS) {
    if (!inScope(OPTION_CATALOGUE[id], ctx)) continue;
    const def = valueDef(id, ev.effective[id]);
    if (def) out.push({ option: id, value: ev.effective[id], def });
  }
  return out;
}

/** Honest label keys for an evaluation: fixed headline, trust parties and what stays visible. Never prose. */
export function honestLabel(ev: Evaluation): { readonly headline: WarningKey; readonly trusts: readonly TrustParty[]; readonly stillVisible: readonly LeakKey[]; readonly warnings: readonly WarningKey[] } {
  return {
    headline: 'privacy.warn.noAnonymity',
    trusts: ev.trust,
    stillVisible: ev.doesNotHide,
    warnings: uniqSorted(ev.warnings.map((w) => w.key as WarningKey)),
  };
}
