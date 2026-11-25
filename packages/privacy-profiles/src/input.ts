/**
 * Runtime shape guards for the two inputs every entry point takes: a selection and a context.
 * TypeScript types do not protect callers that pass JSON, `any` or values from storage, so every public function
 * normalises through here and reports what it had to repair. Repairs are always the restrictive choice
 * (empty capabilities, `settings` action, no acknowledgements): malformed input can only block, never allow.
 * @security A non-array `acks` is never read as an array: a string would match acknowledgement keys by substring.
 */
import { ACTIONS, ASSET_KINDS, ENVS } from './types.js';
import type { Action, AssetKind, Capability, Context, Env, Selection } from './types.js';

/** Which part of an input was malformed. Stable ids, safe to show. */
export type InputProblem =
  | 'selection'
  | 'selection.values'
  | 'selection.acks'
  | 'context'
  | 'context.action'
  | 'context.env'
  | 'context.chainId'
  | 'context.btcNetwork'
  | 'context.asset'
  | 'context.capabilities';

/** A value that is a non-array object (null excluded). */
export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * True for a real `Set` (or subclass) from any realm. `Set.prototype.has` checks the internal slot, so arrays, look-alike
 * objects with their own `has` and objects that merely claim `Symbol.toStringTag = 'Set'` are all rejected.
 */
export const isSet = (x: unknown): x is ReadonlySet<unknown> => {
  if (typeof x !== 'object' || x === null) return false;
  try {
    Set.prototype.has.call(x, undefined);
    return true;
  } catch {
    return false;
  }
};

const SAFE_SELECTION: Selection = Object.freeze({ preset: 'custom', values: Object.freeze({}), acks: Object.freeze([]) });

/**
 * Returns the selection itself when it is well formed (same reference), otherwise a repaired copy and the problems.
 */
export function normalizeSelection(raw: unknown): { readonly selection: Selection; readonly problems: readonly InputProblem[] } {
  if (!isRecord(raw)) return { selection: SAFE_SELECTION, problems: ['selection'] };
  const valuesOk = isRecord(raw['values']);
  const acksOk = Array.isArray(raw['acks']);
  if (valuesOk && acksOk) return { selection: raw as unknown as Selection, problems: [] };
  const problems: InputProblem[] = [];
  if (!valuesOk) problems.push('selection.values');
  if (!acksOk) problems.push('selection.acks');
  const preset = raw['preset'];
  return {
    selection: {
      preset: typeof preset === 'string' ? (preset as Selection['preset']) : 'custom',
      values: valuesOk ? (raw['values'] as Selection['values']) : {},
      acks: acksOk ? (raw['acks'] as Selection['acks']) : [],
    },
    problems,
  };
}

/** Most restrictive context: settings view (every option in scope), no chain, no capabilities. A fresh Set each time. */
const fallback = (): Context => ({ action: 'settings', chainId: null, env: 'web', capabilities: new Set<Capability>() });

const isAction = (x: unknown): x is Action => typeof x === 'string' && (ACTIONS as readonly string[]).includes(x);
const isEnv = (x: unknown): x is Env => typeof x === 'string' && (ENVS as readonly string[]).includes(x);
const isAsset = (x: unknown): x is AssetKind => typeof x === 'string' && (ASSET_KINDS as readonly string[]).includes(x);

/**
 * Returns the context itself when it is well formed (same reference), otherwise a repaired copy and the problems.
 * Chain id must be an integer or `null`; whether a chain is supported is a separate, rule-level question (R-01).
 */
export function normalizeContext(raw: unknown): { readonly context: Context; readonly problems: readonly InputProblem[] } {
  if (!isRecord(raw)) return { context: fallback(), problems: ['context'] };
  const problems: InputProblem[] = [];
  const action = raw['action'];
  const env = raw['env'];
  const chainId = raw['chainId'];
  const btc = raw['btcNetwork'];
  const asset = raw['asset'];
  const caps = raw['capabilities'];
  if (!isAction(action)) problems.push('context.action');
  if (!isEnv(env)) problems.push('context.env');
  if (!(chainId === null || (typeof chainId === 'number' && Number.isInteger(chainId)))) problems.push('context.chainId');
  if (!(btc === undefined || btc === null || typeof btc === 'string')) problems.push('context.btcNetwork');
  if (!(asset === undefined || isAsset(asset))) problems.push('context.asset');
  if (!isSet(caps)) problems.push('context.capabilities');
  if (problems.length === 0) return { context: raw as unknown as Context, problems };
  const ok = (p: InputProblem): boolean => !problems.includes(p);
  const base = fallback();
  return {
    context: {
      action: ok('context.action') ? (action as Action) : base.action,
      chainId: ok('context.chainId') ? (chainId as number | null) : base.chainId,
      env: ok('context.env') ? (env as Env) : base.env,
      capabilities: ok('context.capabilities') ? (caps as ReadonlySet<Capability>) : base.capabilities,
      ...(ok('context.btcNetwork') && btc !== undefined ? { btcNetwork: btc as string | null } : {}),
      ...(ok('context.asset') && asset !== undefined ? { asset: asset as AssetKind } : {}),
    },
    problems,
  };
}
