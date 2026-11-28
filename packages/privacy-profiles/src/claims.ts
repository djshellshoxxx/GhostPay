/**
 * Truthful descriptions of what a configuration or preset does and does not claim.
 *
 * The strongest thing this package can say about a value is `asserted`: the caller says the capabilities it needs are
 * present, the value is mature enough to offer, the context supports it and no rule blocks it. Nothing is verified here
 * (capabilities are inputs) and nothing is qualified (that needs end-to-end evidence this package cannot have), so every
 * description says `unqualified` and `verified: false`. Experimental, test-only, stub and watch values can never be
 * `asserted`, whatever capabilities are present.
 *
 * Output is keys and ids, never UI prose.
 * @security A description is not a guarantee of protection. The headline is always `privacy.warn.noAnonymity`.
 */
import { toConfig } from './config.js';
import type { ConsentKey, ProfileConfig } from './config.js';
import { deepFreeze } from './freeze.js';
import { SELFTEST_CAP, honestLabel, unmetCapabilities } from './evaluate.js';
import type { AppliedValue } from './evaluate.js';
import { normalizeContext } from './input.js';
import { reviewConfig } from './snapshot.js';
import { applyPreset } from './resolve.js';
import type { AckKey, Capability, Context, Downgrade, Evaluation, Issue, LeakKey, Maturity, OptionId, PresetId, StrengthClass, TrustParty, WarningKey } from './types.js';

/**
 * What can honestly be said about one value:
 * - `asserted`: caller-asserted capabilities present, supported here, nothing blocks it. Not verified, not qualified.
 * - `unavailable`: stub or watch value; cannot be selected.
 * - `unsupported-context`: wrong chain, environment or asset for this value.
 * - `test-only`: mock value; never offered as protection.
 * - `missing-capability`: a capability or self-test it needs is not asserted.
 * - `blocked`: another rule, dependency or conflict blocks it.
 * - `experimental`: the specs call it experimental.
 */
export type ClaimStatus = 'asserted' | 'unavailable' | 'unsupported-context' | 'test-only' | 'missing-capability' | 'blocked' | 'experimental';

/** One value that takes effect, with the status it can honestly be given. */
export interface ValueClaim {
  readonly option: OptionId;
  readonly value: string;
  readonly maturity: Maturity;
  readonly strength: StrengthClass;
  readonly status: ClaimStatus;
  readonly requires: readonly Capability[];
  /** Required capabilities the context does not assert. */
  readonly missing: readonly Capability[];
  readonly trust: readonly TrustParty[];
}

/** Description of a configuration in a context. */
export interface ConfigDescription {
  /** Always `unqualified`: qualification needs exact-context end-to-end evidence this package cannot hold. */
  readonly qualification: 'unqualified';
  /** Always `false`: capabilities are caller assertions. */
  readonly verified: false;
  readonly headline: 'privacy.warn.noAnonymity';
  readonly evaluationOk: boolean;
  /**
   * Acknowledgements and consents are separate from claims: a value can be `asserted` and the configuration still not
   * ready. `ready` is true only for a valid configuration with no blocking issue and nothing missing.
   */
  readonly requiredAcks: readonly AckKey[];
  readonly missingAcks: readonly AckKey[];
  readonly requiredConsents: readonly ConsentKey[];
  readonly missingConsents: readonly ConsentKey[];
  readonly ready: boolean;
  readonly claims: readonly ValueClaim[];
  readonly trust: readonly TrustParty[];
  /** What the effective values leave visible. Never empty for a non-default value. */
  readonly stillVisible: readonly LeakKey[];
  readonly warnings: readonly WarningKey[];
}

/** Description of a preset result, including what the preset wanted and could not apply. */
export interface PresetDescription extends ConfigDescription {
  readonly preset: PresetId | 'custom';
  readonly notApplied: readonly Downgrade[];
}

const CONTEXT_CODES = new Set(['E_WRONG_CHAIN', 'E_WRONG_ENV', 'E_WRONG_ASSET']);
const CAPABILITY_CODES = new Set(['E_CAPABILITY', 'E_SELFTEST']);

const CAP_KEY_PREFIX = 'privacy.err.requires.cap.';

/**
 * Capabilities the value needs that the context does not assert: from its definition, from the value-level capability
 * issues, from the self-test its network profile needs, and from the `requires` rule that fired for it (derived from the
 * rule's own `then` clause, so there is no second copy of the rule data here). A rule that names several options reports
 * its unmet capabilities for each of them.
 */
function missingOf(a: AppliedValue, caps: ReadonlySet<Capability>, evaluation: Evaluation, ctx: Context): Capability[] {
  const missing: Capability[] = a.def.requires.filter((c) => c !== 'test-mode');
  const any = a.def.requiresAny;
  if (any && !any.some((c) => caps.has(c))) missing.push(...any);
  for (const i of evaluation.blocking) {
    if (!CAPABILITY_CODES.has(i.code) || !i.options.includes(a.option)) continue;
    if (i.key.startsWith(CAP_KEY_PREFIX)) missing.push(i.key.slice(CAP_KEY_PREFIX.length) as Capability);
    if (i.code === 'E_SELFTEST') {
      const needed = SELFTEST_CAP[a.option];
      if (needed !== undefined) missing.push(needed);
    }
    if (i.ruleId !== undefined) missing.push(...unmetCapabilities(i.ruleId, evaluation.effective, ctx));
  }
  return [...new Set(missing)].filter((c) => !caps.has(c)).sort();
}

function statusOf(a: AppliedValue, issues: readonly Issue[]): ClaimStatus {
  const mine = issues.filter((i) => i.code !== 'E_ACK_MISSING' && i.options.includes(a.option));
  const codes = new Set(mine.map((i) => i.code));
  const m = a.def.maturity;
  if (codes.has('E_MATURITY') || m === 'stub' || m === 'watch') return 'unavailable';
  if ([...codes].some((c) => CONTEXT_CODES.has(c))) return 'unsupported-context';
  if (m === 'test-only') return 'test-only';
  if ([...codes].some((c) => CAPABILITY_CODES.has(c))) return 'missing-capability';
  if (mine.length > 0) return 'blocked';
  if (m === 'experimental') return 'experimental';
  return 'asserted';
}

/** Describes a configuration in a context. Total, deterministic, deeply frozen. */
export function describeConfig(cfg: ProfileConfig, ctx: Context): ConfigDescription {
  const review = reviewConfig(cfg, ctx);
  const { evaluation, applied } = review;
  const caps = normalizeContext(ctx).context.capabilities;
  const claims: ValueClaim[] = applied.map((a) => ({
    option: a.option,
    value: a.value,
    maturity: a.def.maturity,
    strength: a.def.strength,
    status: statusOf(a, evaluation.blocking),
    requires: a.def.requires,
    missing: missingOf(a, caps, evaluation, ctx),
    trust: a.trust,
  }));
  const label = honestLabel(evaluation);
  return deepFreeze({
    qualification: 'unqualified' as const,
    verified: false as const,
    headline: label.headline as 'privacy.warn.noAnonymity',
    evaluationOk: evaluation.ok,
    requiredAcks: evaluation.requiredAcks,
    missingAcks: evaluation.requiredAcks.filter((a) => !review.config.acks.includes(a)),
    requiredConsents: review.requiredConsents.map((r) => r.key),
    missingConsents: review.missingConsents,
    ready: review.ready,
    claims,
    trust: label.trusts,
    stillVisible: label.stillVisible,
    warnings: label.warnings,
  });
}

/**
 * Applies a preset in a context and describes the result. Whatever the preset wanted but could not apply is listed in
 * `notApplied` with the reason, so a preset name never suggests more than the context allows.
 */
export function describePreset(id: PresetId, ctx: Context): PresetDescription {
  const r = applyPreset(id, ctx);
  const cfg = toConfig(r.selection);
  return deepFreeze({ ...describeConfig(cfg, ctx), preset: r.selection.preset, notApplied: r.downgrades });
}
