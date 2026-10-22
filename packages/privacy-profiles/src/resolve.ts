/**
 * Selection construction: defaults, preset resolution, single-option changes, acknowledgements.
 * @security Acks are never added here except by {@link acknowledge}; presets never give them.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { ACK_KEYS } from './keys.js';
import { PRESETS } from './presets.js';
import { evaluate, valueDef, withIssue } from './evaluate.js';
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
  return { preset: 'standard', values: {}, acks: [] };
}

const setValue = (sel: Selection, id: OptionId, value: string): Selection => {
  const values: Partial<Record<OptionId, string>> = { ...sel.values };
  if (value === OPTION_CATALOGUE[id].defaultValue) delete values[id];
  else values[id] = value;
  return { ...sel, values };
};

/** Changes one option; label becomes `custom`. Operator options and unknown values leave the selection unchanged. */
export function setOption(
  sel: Selection,
  id: OptionId,
  value: string,
  ctx: Context,
): { selection: Selection; evaluation: Evaluation } {
  const def = Object.prototype.hasOwnProperty.call(OPTION_CATALOGUE, id) ? OPTION_CATALOGUE[id] : undefined;
  if (!def || !def.values.some((v) => v.value === value)) {
    const issue: Issue = { code: 'E_UNKNOWN_VALUE', key: 'privacy.err.unknownValue', options: def ? [id] : [] };
    return { selection: sel, evaluation: withIssue(evaluate(sel, ctx), issue) };
  }
  if (!def.userSelectable) {
    const issue: Issue = { code: 'E_NOT_SELECTABLE', key: 'privacy.err.notSelectable', options: [id] };
    return { selection: sel, evaluation: withIssue(evaluate(sel, ctx), issue) };
  }
  const selection: Selection = { ...setValue(sel, id, value), preset: 'custom' };
  return { selection, evaluation: evaluate(selection, ctx) };
}

/** Records an acknowledgement. Unknown keys are ignored. Result keeps acks sorted and unique. */
export function acknowledge(sel: Selection, ack: AckKey): Selection {
  if (!(ACK_KEYS as readonly string[]).includes(ack)) return sel;
  return { ...sel, acks: [...new Set([...sel.acks, ack])].sort() };
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
 */
export function applyPreset(id: PresetId, ctx: Context): PresetResult {
  const preset = PRESETS[id];
  const views: Context[] = [{ ...ctx, action: 'settings' }, ctx];
  let sel: Selection = { preset: id, values: {}, acks: [] };
  const downgrades: Downgrade[] = [];
  const order = [...new Set<OptionId>([...preset.order, ...OPTION_IDS])];
  for (const opt of order) {
    const list = preset.prefer[opt];
    if (!list) continue;
    const base = views.map((v) => blockingKeys(evaluate(sel, v)));
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
        for (const [k, iss] of blockingKeys(evaluate(trial, v))) if (!b.has(k)) fresh ??= iss;
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
  return { selection: sel, evaluation: evaluate(sel, ctx), downgrades };
}
