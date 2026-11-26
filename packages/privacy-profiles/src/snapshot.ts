/**
 * Review and commit of a configuration: which consents it needs, and an immutable snapshot of an accepted one.
 *
 * `reviewConfig` is the "review" step (F18 section 1). It first normalises the input with the strict rules of the stored
 * format (own properties only, every problem reported), then evaluates that normalised configuration, so the thing that
 * is evaluated is exactly the thing that is stored. It lists every party and every experimental value the user must
 * consent to. `createSnapshot` is the "accept" step: it only succeeds when the configuration is valid, has no blocking
 * issue (acknowledgements included) and every required consent is recorded. The snapshot keeps only the
 * acknowledgements and consents the configuration needs, is a deep copy and deeply frozen, with capabilities as a sorted
 * array, so later changes to the caller's objects or Set cannot alter it and an in-flight plan keeps the configuration it
 * was approved with. `snapshotIsCurrent` tells whether the inputs still match, so a changed configuration or context
 * invalidates a pending review.
 *
 * Scope: the review covers the values that take effect for the context's action (the settings action covers all of
 * them). Values for other actions are kept in the snapshot, because rules read the full selection, and are listed in
 * `outOfScope` so a consumer can see they were not reviewed for this action.
 *
 * @security A snapshot is an in-memory result, not a credential. Do not trust one read back from storage: store the
 * config (`serializeConfig`) and call `createSnapshot` again.
 * @security This package has no paid feature, provider call or network request. Fee and quote consent belongs to the fee
 * policy module; nothing here can grant it.
 */
import { OPTION_CATALOGUE } from './catalogue.js';
import { inspectConfig } from './config.js';
import type { ConfigError, ConsentKey, ProfileConfig } from './config.js';
import { evaluateWithApplied, inScope } from './evaluate.js';
import type { AppliedValue } from './evaluate.js';
import { deepFreeze } from './freeze.js';
import { isRecord, normalizeContext } from './input.js';
import { PRESETS } from './presets.js';
import { applyPreset } from './resolve.js';
import type { Action, AssetKind, Capability, Context, Env, Evaluation, OptionId, Selection } from './types.js';

/** One consent a configuration needs, with the options that need it. */
export interface ConsentRequirement {
  readonly key: ConsentKey;
  readonly options: readonly OptionId[];
}

/** The review of a configuration in a context. */
export interface ConfigReview {
  /** The normalised configuration that was evaluated (invalid entries dropped; they are in `configErrors`). */
  readonly config: ProfileConfig;
  /** Problems with the input itself, using the stored-format codes. Any entry makes the review not ready. */
  readonly configErrors: readonly ConfigError[];
  readonly evaluation: Evaluation;
  /** The values that take effect for the action, with their definitions. */
  readonly applied: readonly AppliedValue[];
  /** Selected options that do not apply to the context's action and so were not reviewed for it. */
  readonly outOfScope: readonly OptionId[];
  /** Every consent the effective values need, sorted by key. */
  readonly requiredConsents: readonly ConsentRequirement[];
  /** Required and not recorded. */
  readonly missingConsents: readonly ConsentKey[];
  /** Recorded and not needed by the current selection (harmless; shown so the user can withdraw them). */
  readonly unusedConsents: readonly ConsentKey[];
  /** A valid configuration, no blocking issue (acknowledgements included) and no missing consent. */
  readonly ready: boolean;
}

/** Evaluates a configuration and derives its consent requirements. Total and deterministic. */
export function reviewConfig(cfg: ProfileConfig, ctx: Context): ConfigReview {
  const { config, errors } = inspectConfig(cfg);
  const { evaluation, applied } = evaluateWithApplied(config, ctx);
  const { context } = normalizeContext(ctx);
  const need = new Map<ConsentKey, Set<OptionId>>();
  const add = (k: ConsentKey, o: OptionId): void => {
    const s = need.get(k) ?? new Set<OptionId>();
    s.add(o);
    need.set(k, s);
  };
  for (const a of applied) {
    for (const t of a.trust) add(`party:${t}`, a.option);
    if (a.def.maturity === 'experimental') add(`experimental:${a.option}=${a.value}`, a.option);
  }
  const requiredConsents = [...need.keys()].sort().map((key) => ({ key, options: [...(need.get(key) ?? [])].sort() }));
  const have = new Set(config.consents);
  const required = new Set(requiredConsents.map((r) => r.key));
  const missingConsents = requiredConsents.map((r) => r.key).filter((k) => !have.has(k));
  const unusedConsents = [...have].filter((k) => !required.has(k)).sort();
  const outOfScope = (Object.keys(config.values) as OptionId[]).filter((o) => !inScope(OPTION_CATALOGUE[o], context)).sort();
  const ready = errors.length === 0 && evaluation.ok && missingConsents.length === 0;
  return deepFreeze({ config, configErrors: errors, evaluation, applied, outOfScope, requiredConsents, missingConsents, unusedConsents, ready });
}

/** The context a snapshot was taken in. Capabilities are a sorted array, not a Set, so they can be frozen. */
export interface SnapshotContext {
  readonly action: Action;
  readonly chainId: number | null;
  readonly btcNetwork: string | null;
  readonly env: Env;
  readonly asset: AssetKind | null;
  readonly capabilities: readonly Capability[];
}

/** An accepted configuration. Deeply frozen. */
export interface ConfigSnapshot {
  readonly version: 1;
  /** The reviewed configuration with only the acknowledgements and consents it needs, and a label that matches its values. */
  readonly config: ProfileConfig;
  readonly context: SnapshotContext;
  readonly evaluation: Evaluation;
  /** The consents the configuration needed, all of which were recorded (equal to `config.consents`). */
  readonly consents: readonly ConsentKey[];
  /** Options that are selected but were not reviewed because they do not apply to the action. */
  readonly outOfScope: readonly OptionId[];
  /** Exact text identity of config and context; two snapshots are equal when this is equal. */
  readonly canonical: string;
}

/** Why a snapshot was refused. */
export type SnapshotFailureKey = 'privacy.err.snapshot.blocked' | 'privacy.err.snapshot.consentMissing' | 'privacy.err.snapshot.invalidConfig';

/** Outcome of {@link createSnapshot}. */
export type SnapshotResult =
  | { readonly ok: true; readonly snapshot: ConfigSnapshot }
  | { readonly ok: false; readonly reasons: readonly SnapshotFailureKey[]; readonly review: ConfigReview };

function snapshotContext(ctx: Context): SnapshotContext {
  return {
    action: ctx.action,
    chainId: ctx.chainId,
    btcNetwork: ctx.btcNetwork ?? null,
    env: ctx.env,
    asset: ctx.asset ?? null,
    capabilities: [...ctx.capabilities].sort(),
  };
}

const sameValues = (a: Selection['values'], b: Selection['values']): boolean => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * A preset label is kept only when the values are exactly what that preset resolves to in this context. The default
 * selection (label `standard`, no values) is today's behaviour and keeps its label (DEVIATIONS 2). Anything else is `custom`.
 */
function labelFor(label: Selection['preset'], values: Selection['values'], ctx: Context): Selection['preset'] {
  if (label === 'custom' || !Object.prototype.hasOwnProperty.call(PRESETS, label)) return 'custom';
  if (label === 'standard' && Object.keys(values).length === 0) return 'standard';
  return sameValues(applyPreset(label, ctx).selection.values, values) ? label : 'custom';
}

/** What a ready review commits to: the config reduced to what it needs, and the context it was taken in. */
function commitment(review: ConfigReview, ctx: Context): { readonly config: ProfileConfig; readonly context: SnapshotContext } {
  const context = snapshotContext(normalizeContext(ctx).context);
  const config: ProfileConfig = {
    preset: labelFor(review.config.preset, review.config.values, normalizeContext(ctx).context),
    values: review.config.values,
    acks: review.evaluation.requiredAcks,
    consents: review.requiredConsents.map((r) => r.key),
  };
  return { config, context };
}

const canonicalOf = (config: ProfileConfig, context: SnapshotContext): string =>
  JSON.stringify({
    config: { acks: config.acks, consents: config.consents, preset: config.preset, values: config.values },
    context: { action: context.action, asset: context.asset, btcNetwork: context.btcNetwork, capabilities: context.capabilities, chainId: context.chainId, env: context.env },
    snapshot: 1,
  });

/**
 * Accepts a configuration: succeeds only when the review is ready. The result never aliases the inputs.
 * Never throws; malformed input gives `ok: false`.
 */
export function createSnapshot(cfg: ProfileConfig, ctx: Context): SnapshotResult {
  const review = reviewConfig(cfg, ctx);
  if (!review.ready) {
    const reasons: SnapshotFailureKey[] = [];
    if (review.configErrors.length > 0) reasons.push('privacy.err.snapshot.invalidConfig');
    if (!review.evaluation.ok) reasons.push('privacy.err.snapshot.blocked');
    if (review.missingConsents.length > 0) reasons.push('privacy.err.snapshot.consentMissing');
    return deepFreeze({ ok: false as const, reasons, review });
  }
  const { config, context } = commitment(review, ctx);
  const snapshot: ConfigSnapshot = {
    version: 1,
    config,
    context,
    evaluation: evaluateWithApplied(config, ctx).evaluation,
    consents: config.consents,
    outOfScope: review.outOfScope,
    canonical: canonicalOf(config, context),
  };
  return deepFreeze({ ok: true as const, snapshot });
}

/**
 * True when `cfg` and `ctx` would produce exactly this snapshot again: the configuration is valid and ready, and its
 * selection, required acknowledgements and consents, label, action, chain, environment, asset and capabilities are the
 * same. Input that `createSnapshot` would refuse is never current.
 */
export function snapshotIsCurrent(snapshot: ConfigSnapshot, cfg: ProfileConfig, ctx: Context): boolean {
  if (!isRecord(snapshot) || typeof snapshot.canonical !== 'string') return false;
  const review = reviewConfig(cfg, ctx);
  if (!review.ready) return false;
  const { config, context } = commitment(review, ctx);
  return canonicalOf(config, context) === snapshot.canonical;
}
