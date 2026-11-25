/**
 * Review and commit of a configuration: which consents it needs, and an immutable snapshot of an accepted one.
 *
 * `reviewConfig` is the "review" step (F18 section 1): it evaluates the selection and lists every party and every
 * experimental value the user must consent to. `createSnapshot` is the "accept" step: it only succeeds when the evaluation
 * has no blocking issue (acknowledgements included) and every required consent is recorded. The snapshot is a deep copy,
 * deeply frozen, with capabilities as a sorted array, so later changes to the caller's objects or Set cannot alter it
 * and an in-flight plan keeps the configuration it was approved with. `snapshotIsCurrent` tells whether the inputs still
 * match, so a changed configuration or context invalidates a pending review.
 *
 * @security A snapshot is an in-memory result, not a credential. Do not trust one read back from storage: store the
 * config (`serializeConfig`) and call `createSnapshot` again.
 * @security This package has no paid feature, provider call or network request. Fee and quote consent belongs to the fee
 * policy module; nothing here can grant it.
 */
import { readConsents, toConfig } from './config.js';
import type { ConsentKey, ProfileConfig } from './config.js';
import { deepFreeze } from './freeze.js';
import { evaluateWithApplied } from './evaluate.js';
import { isRecord, normalizeContext } from './input.js';
import type { AssetKind, Capability, Context, Env, Evaluation, OptionId, Action } from './types.js';

/** One consent a configuration needs, with the options that need it. */
export interface ConsentRequirement {
  readonly key: ConsentKey;
  readonly options: readonly OptionId[];
}

/** The review of a configuration in a context. */
export interface ConfigReview {
  readonly evaluation: Evaluation;
  /** Every consent the effective values need, sorted by key. */
  readonly requiredConsents: readonly ConsentRequirement[];
  /** Required and not recorded. */
  readonly missingConsents: readonly ConsentKey[];
  /** Recorded and not needed by the current selection (harmless; shown so the user can withdraw them). */
  readonly unusedConsents: readonly ConsentKey[];
  /** No blocking issue (acknowledgements included) and no missing consent. */
  readonly ready: boolean;
}

/** Evaluates a configuration and derives its consent requirements. Total and deterministic. */
export function reviewConfig(cfg: ProfileConfig, ctx: Context): ConfigReview {
  const { evaluation, applied } = evaluateWithApplied(cfg, ctx);
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
  const have = new Set(readConsents(cfg));
  const required = new Set(requiredConsents.map((r) => r.key));
  const missingConsents = requiredConsents.map((r) => r.key).filter((k) => !have.has(k));
  const unusedConsents = [...have].filter((k) => !required.has(k)).sort();
  return deepFreeze({ evaluation, requiredConsents, missingConsents, unusedConsents, ready: evaluation.ok && missingConsents.length === 0 });
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
  readonly config: ProfileConfig;
  readonly context: SnapshotContext;
  readonly evaluation: Evaluation;
  /** The consents the configuration needed, all of which were recorded. */
  readonly consents: readonly ConsentKey[];
  /** Exact text identity of config and context; two snapshots are equal when this is equal. */
  readonly canonical: string;
}

/** Why a snapshot was refused. */
export type SnapshotFailureKey = 'privacy.err.snapshot.blocked' | 'privacy.err.snapshot.consentMissing';

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
    if (!review.evaluation.ok) reasons.push('privacy.err.snapshot.blocked');
    if (review.missingConsents.length > 0) reasons.push('privacy.err.snapshot.consentMissing');
    return deepFreeze({ ok: false as const, reasons, review });
  }
  const config = toConfig(cfg, readConsents(cfg));
  const context = deepFreeze(snapshotContext(normalizeContext(ctx).context));
  const snapshot: ConfigSnapshot = {
    version: 1,
    config,
    context,
    evaluation: review.evaluation,
    consents: config.consents,
    canonical: canonicalOf(config, context),
  };
  return deepFreeze({ ok: true as const, snapshot });
}

/**
 * True when `cfg` and `ctx` still produce exactly this snapshot's canonical identity (same selection, acknowledgements,
 * consents, action, chain, environment, asset and capabilities). Malformed input is never current.
 */
export function snapshotIsCurrent(snapshot: ConfigSnapshot, cfg: ProfileConfig, ctx: Context): boolean {
  if (!isRecord(snapshot) || typeof snapshot.canonical !== 'string' || !isRecord(cfg)) return false;
  const { context, problems } = normalizeContext(ctx);
  if (problems.length > 0) return false;
  const config = toConfig(cfg, readConsents(cfg));
  return canonicalOf(config, snapshotContext(context)) === snapshot.canonical;
}
