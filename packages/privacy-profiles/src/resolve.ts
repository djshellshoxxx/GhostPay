/**
 * Selection construction: defaults, preset resolution, single-option changes, acknowledgements.
 * Every function is total: malformed input is repaired to its most restrictive form and reported by `evaluate`.
 * Every returned selection and result is deeply frozen, so a validated configuration cannot be edited in place.
 * @security Acks are never added here except by {@link acknowledge}; presets never give them.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { deepFreeze } from './freeze.js';
import { normalizeContext, normalizeSelection } from './input.js';
import { ACK_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { evaluate, evaluateRaw, valueDef, withIssue } from './evaluate.js';
import { OPTION_IDS } from './types.js';
import type {
  AckKey,
  Context,
  Downgrade,
  Evaluation,
  Issue,
  IssueCode,
  OptionId,
  PresetId,
  PresetResult,
  Selection,
} from './types.js';

/** Default selection: every option at its default (today's behaviour). */
export function defaultSelection(): Selection {
  return deepFreeze({ preset: 'standard', values: {}, acks: [] });
}

const setValue = (sel: Selection, id: OptionId, value: string): Selection => {
  const values: Partial<Record<OptionId, string>> = { ...sel.values };
  if (value === OPTION_CATALOGUE[id].defaultValue) delete values[id];
  else values[id] = value;
  return { preset: sel.preset, values, acks: sel.acks };
};

/** Changes one option; label becomes `custom`. Operator options and unknown values leave the selection unchanged. */
export function setOption(
  selIn: Selection,
  id: OptionId,
  value: string,
  ctx: Context,
): { selection: Selection; evaluation: Evaluation } {
  const sel = normalizeSelection(selIn).selection;
  const def = Object.prototype.hasOwnProperty.call(OPTION_CATALOGUE, id) ? OPTION_CATALOGUE[id] : undefined;
  if (!def || !def.values.some((v) => v.value === value)) {
    const issue: Issue = { code: 'E_UNKNOWN_VALUE', key: 'privacy.err.unknownValue', options: def ? [id] : [] };
    return { selection: sel, evaluation: withIssue(evaluate(sel, ctx), issue) };
  }
  if (!def.userSelectable) {
    const issue: Issue = { code: 'E_NOT_SELECTABLE', key: 'privacy.err.notSelectable', options: [id] };
    return { selection: sel, evaluation: withIssue(evaluate(sel, ctx), issue) };
  }
  const selection: Selection = deepFreeze({ ...setValue(sel, id, value), preset: 'custom' });
  return { selection, evaluation: evaluate(selection, ctx) };
}

/** Records an acknowledgement. Unknown keys are ignored. Result keeps acks sorted and unique. */
export function acknowledge(selIn: Selection, ack: AckKey): Selection {
  const { selection: sel, problems } = normalizeSelection(selIn);
  if (!(ACK_KEYS as readonly string[]).includes(ack)) return problems.length === 0 ? sel : deepFreeze({ ...sel });
  const acks = [...new Set([...sel.acks.filter((a): a is AckKey => typeof a === 'string'), ack])].sort();
  return deepFreeze({ preset: sel.preset, values: { ...sel.values }, acks });
}

const FORBIDDEN = new Set(['experimental', 'test-only', 'stub', 'watch']);

function blockingKeys(ev: Evaluation): Map<string, Issue> {
  const m = new Map<string, Issue>();
  for (const i of ev.blocking) if (i.code !== 'E_ACK_MISSING') m.set(`${i.code}|${i.key}|${i.options.join(',')}`, i);
  return m;
}

/**
 * Greedy, deterministic preset resolution against what the context can do.
 * A value is taken when it adds no blocking issue (other than missing acks) in the settings view and in the action view.
 * An unknown preset id or a malformed context yields the default selection with a blocking issue, never a throw.
 * Downgrades are reported, never silent: a preset only proposes, the caller must review and accept the result.
 */
export function applyPreset(id: PresetId, ctxIn: Context): PresetResult {
  const ctx = normalizeContext(ctxIn).context;
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PRESETS, id)) {
    const issue: Issue = { code: 'E_UNKNOWN_VALUE', key: 'privacy.err.unknownPreset', options: [] };
    const selection: Selection = deepFreeze({ preset: 'custom', values: {}, acks: [] });
    return deepFreeze({ selection, evaluation: withIssue(evaluate(selection, ctxIn), issue), downgrades: [] });
  }
  const preset = PRESETS[id];
  const views: Context[] = [{ ...ctx, action: 'settings' }, ctx];
  let sel: Selection = { preset: id, values: {}, acks: [] };
  const downgrades: Downgrade[] = [];
  const order = [...new Set<OptionId>([...preset.order, ...OPTION_IDS])];
  for (const opt of order) {
    const list = preset.prefer[opt];
    if (!list) continue;
    const base = views.map((v) => blockingKeys(evaluateRaw(sel, v)));
    let chosen = list[list.length - 1] as string;
    let reason: Issue | undefined;
    for (let i = 0; i < list.length; i++) {
      const cand = list[i] as string;
      const vd = valueDef(opt, cand);
      if (!vd) continue;
      const isDefault = cand === OPTION_CATALOGUE[opt].defaultValue;
      if (!isDefault && (FORBIDDEN.has(vd.maturity) || (opt === 'sweep.hops' && cand !== '0') || (opt === 'btc.mode' && cand !== 'silent-payment'))) {
        reason ??= { code: 'E_MATURITY', key: 'privacy.err.notAvailable', options: [opt] };
        continue;
      }
      const trial = setValue(sel, opt, cand);
      let fresh: Issue | undefined;
      views.forEach((v, n) => {
        const b = base[n] as Map<string, Issue>;
        for (const [k, iss] of blockingKeys(evaluateRaw(trial, v))) if (!b.has(k)) fresh ??= iss;
      });
      if (fresh === undefined || isDefault) {
        chosen = cand;
        break;
      }
      reason ??= fresh;
    }
    sel = setValue(sel, opt, chosen);
    if (chosen !== list[0]) {
      const code: IssueCode = reason?.code ?? 'E_CAPABILITY';
      downgrades.push({ option: opt, wanted: list[0] as string, got: chosen, reason: code, key: reason?.key ?? 'privacy.err.requires.cap' });
    }
  }
  return deepFreeze({ selection: sel, evaluation: evaluate(sel, ctxIn), downgrades });
}
