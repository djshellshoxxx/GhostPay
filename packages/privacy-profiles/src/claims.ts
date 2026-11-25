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
import type { ProfileConfig } from './config.js';
import { deepFreeze } from './freeze.js';
import { evaluateWithApplied, honestLabel } from './evaluate.js';
import type { AppliedValue } from './evaluate.js';
import { normalizeContext } from './input.js';
import { applyPreset } from './resolve.js';
import type { Capability, Context, Downgrade, Issue, LeakKey, Maturity, OptionId, PresetId, StrengthClass, TrustParty, WarningKey } from './types.js';

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
const RULE_CAPS: Readonly<Record<string, readonly Capability[]>> = {
  'privacy.err.requires.sweepRelayer': ['sweep-relayer'],
  'privacy.err.requires.sellerCt': ['seller-accepts-ct'],
};

/** Capabilities a capability-type issue says are absent: from its key, or from the option it names. */
function issueCaps(i: Issue, option: OptionId): Capability[] {
  if (i.key.startsWith(CAP_KEY_PREFIX)) return [i.key.slice(CAP_KEY_PREFIX.length) as Capability];
  const fixed = RULE_CAPS[i.key];
  if (fixed) return [...fixed];
  if (i.key === 'privacy.err.requires.multiEndpoint') return [option === 'relayer.multi' ? 'multi-relayer' : 'multi-rpc'];
  if (i.code === 'E_SELFTEST') return [option === 'net.relayerProfile' ? 'selftest-ok:relayer' : 'selftest-ok:rpc'];
  return [];
}

/** Capabilities the value needs that the context does not assert: from its definition and from the rules that fired. */
function missingOf(a: AppliedValue, caps: ReadonlySet<Capability>, issues: readonly Issue[]): Capability[] {
  const missing: Capability[] = a.def.requires.filter((c) => c !== 'test-mode');
  const any = a.def.requiresAny;
  if (any && !any.some((c) => caps.has(c))) missing.push(...any);
  for (const i of issues) if (CAPABILITY_CODES.has(i.code) && i.options.includes(a.option)) missing.push(...issueCaps(i, a.option));
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
  const { evaluation, applied } = evaluateWithApplied(cfg, ctx);
  const caps = normalizeContext(ctx).context.capabilities;
  const issues = evaluation.blocking;
  const claims: ValueClaim[] = applied.map((a) => ({
    option: a.option,
    value: a.value,
    maturity: a.def.maturity,
    strength: a.def.strength,
    status: statusOf(a, issues),
    requires: a.def.requires,
    missing: missingOf(a, caps, issues),
    trust: a.trust,
  }));
  const label = honestLabel(evaluation);
  return deepFreeze({
    qualification: 'unqualified' as const,
    verified: false as const,
    headline: label.headline as 'privacy.warn.noAnonymity',
    evaluationOk: evaluation.ok,
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
