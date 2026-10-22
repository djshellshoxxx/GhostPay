import { expand } from './plan.js';
import { analyze } from './analyze.js';
import { SWEEP_RELAYER_FEE_MIN_BPS } from './steps.js';
import { RELAY_LIKE, usedPurposes } from './layers.js';
import { validate } from './validate.js';
import type {
  Context,
  Issue,
  NetProfileId,
  Pipeline,
  PipelineSummary,
  PlanNode,
  QuoteMap,
  StepKind,
  StrengthClass,
} from './types.js';
import { assertTestnetChain } from './guard.js';

/** Step-kind sequences of the preset templates (chaining spec 8). Anything else is a rarer shape (E-3). */
export const COMMON_SHAPES: readonly (readonly StepKind[])[] = [
  ['src.wallet', 'pay.submit'],
  ['src.wallet', 'payer.fresh-wallet', 'pay.submit'],
  ['src.wallet', 'amount.shape', 'pay.submit'],
  ['src.wallet', 'payer.fresh-wallet', 'amount.shape', 'pay.submit'],
  ['src.wallet', 'amount.shape', 'pool.deposit', 'pool.dwell', 'pay.from-pool'],
  ['src.wallet', 'payer.fresh-wallet', 'amount.shape', 'pool.deposit', 'pool.dwell', 'pay.from-pool'],
  ['src.wallet', 'ct.wrap', 'pay.submit'],
  ['recv.stealth', 'hygiene.sweep'],
  ['recv.stealth', 'sweep.delay', 'hygiene.sweep'],
  ['recv.stealth', 'pool.deposit', 'pool.dwell', 'pool.exit'],
  ['recv.stealth', 'ct.sweep'],
  ['btc.send'],
  ['btc.recv'],
];

/** Number of steps at or above which the run counts as long (E-6, E-7 notice). */
export const LONG_RUN_STEPS = 6;
const SCALE = 10n ** 12n;

function compound(fees: readonly number[], round: 'floor' | 'ceil'): number {
  let remaining = SCALE;
  for (const f of fees) remaining = (remaining * BigInt(10_000 - Math.min(10_000, Math.max(0, f)))) / 10_000n;
  const num = (SCALE - remaining) * 10_000n;
  const q = num / SCALE;
  return Number(round === 'ceil' && num % SCALE !== 0n ? q + 1n : q);
}

const TRANSPORT_PARTIES: Readonly<Record<NetProfileId, readonly string[]>> = {
  direct: [],
  'tor-browser': ['tor-network', 'tor-exit'],
  'tor-socks': ['tor-network', 'tor-exit'],
  onion: ['tor-network'],
  'i2p-outproxy': ['i2p-outproxy'],
  'nym-mixfetch': ['nym-mixnet'],
  'nym-socks5': ['nym-mixnet'],
  ohttp: ['ohttp-relay', 'ohttp-gateway'],
};

const warn = (key: string, steps: readonly number[] = []): Issue => ({
  severity: 'warn',
  code: 'WARN',
  key,
  steps,
});

/**
 * Dry run: pure summary of cost, latency, trust, strength set and reveals. Uses supplied quotes or the
 * static fee model. Never signs and never calls a driver.
 *
 * Claim rules: no score field exists (PL-8); `creditedDwellMs` counts only `pool.dwell`, at its minimum;
 * `strength` is a set; text is only message keys (CL-1).
 *
 * @security Throws `E_WRONG_CHAIN` outside the allowed testnets and `E_NOT_VALID` for unknown steps.
 */
export function simulate(p: Pipeline, ctx: Context, quotes?: QuoteMap): PipelineSummary {
  assertTestnetChain(p.chain);
  const tree = expand(p);
  const a = analyze(p);
  const v = validate(p, ctx);
  const byStep = new Map<number, PlanNode[]>();
  for (const n of tree.nodes) byStep.set(n.stepIndex, [...(byStep.get(n.stepIndex) ?? []), n]);

  const perStep: { instanceId: string; feeBps: number; feeBpsMin: number; gasWeiMax: bigint }[] = [];
  const maxFees: number[] = [];
  const minFees: number[] = [];
  const ladder: number[] = [];
  let minMs = 0;
  let maxMs = 0;
  let credited = 0;
  let appOpen = false;
  let prompts = 0;
  const feesRunMax: number[] = [];
  for (const st of a.steps) {
    const nodes = byStep.get(st.index) ?? [];
    let sMax = 0;
    let sMin = Number.POSITIVE_INFINITY;
    let wMin = 0;
    let wMax = 0;
    for (const n of nodes) {
      const q = quotes?.[n.instanceId];
      const f = st.def.fee(st.params);
      const feeMax = q !== undefined ? Math.ceil(q.feeBps) : f.maxBps;
      const feeMin = q !== undefined ? Math.floor(q.feeBps) : f.minBps;
      perStep.push({
        instanceId: n.instanceId,
        feeBps: feeMax,
        feeBpsMin: feeMin,
        gasWeiMax: q?.gasWeiMax ?? 0n,
      });
      sMax = Math.max(sMax, feeMax);
      sMin = Math.min(sMin, feeMin);
      const w = st.def.wait(st.params, a.fans[st.index] as number);
      wMin = Math.max(wMin, q?.latencyMinMs ?? w.minMs);
      wMax = Math.max(wMax, q?.latencyMaxMs ?? w.maxMs);
      if (st.def.onChain) prompts += 1;
    }
    maxFees.push(sMax);
    minFees.push(Number.isFinite(sMin) ? sMin : 0);
    minMs += wMin;
    maxMs += wMax;
    if (st.kind === 'pool.dwell') credited += wMin;
    if (st.def.waits && wMax > 0) appOpen = true;
    if (sMax > 0) {
      feesRunMax.push(sMax);
      ladder.push(compound(feesRunMax, 'ceil'));
    }
  }

  const trust = new Set<string>();
  const strength = new Set<StrengthClass>();
  const reveals = new Set<string>(['privacy.warn.testnetOnly', 'privacy.warn.noAnonymity']);
  for (const st of a.steps) {
    for (const t of st.def.trust(st.params)) trust.add(t);
    for (const s of st.def.strength(st.params)) strength.add(s);
    for (const k of st.def.doesNotHide(st.params)) reveals.add(k);
  }
  const used = usedPurposes(a.steps);
  for (const purpose of used.keys()) {
    for (const t of TRANSPORT_PARTIES[p.layers.transport[purpose] ?? 'direct']) trust.add(t);
  }
  if (used.has('scan')) {
    if (p.layers.scanMode === 'pir2') {
      trust.add('pir-server-pair');
      reveals.add('privacy.warn.pirNonCollusion');
    }
    if (p.layers.scanMode === 'indexer-tor') trust.add('indexer');
    if (p.layers.scanMode === 'light-client') {
      trust.add('light-client-checkpoint');
      reveals.add('privacy.warn.lightClientIntegrityOnly');
    }
  }
  if (p.layers.verification === 'direct') reveals.add('privacy.warn.directReadsRevealAddress');
  if (Object.values(p.layers.transport).some((t) => t !== 'direct')) {
    for (const k of ['privacy.warn.contentNotHidden', 'privacy.warn.timingNotHidden']) reveals.add(k);
  }
  if (a.steps.some((s) => ['pool.deposit', 'pool.exit', 'pay.from-pool'].includes(s.kind))) {
    reveals.add('privacy.warn.crowdTiny');
    reveals.add('privacy.warn.depositPublic');
  }

  const emergent: Issue[] = [];
  const feeBearing = a.steps.filter((s) => (maxFees[s.index] ?? 0) > 0).map((s) => s.index);
  if (feeBearing.length >= 2) emergent.push(warn('privacy.warn.chain.amountContinuity', feeBearing));
  if (a.steps.length >= LONG_RUN_STEPS) emergent.push(warn('privacy.warn.chain.longRun'));
  if (appOpen) emergent.push(warn('privacy.warn.chain.appMustStayOpen'));
  const shape = a.steps.map((s) => s.kind).join('>');
  if (!COMMON_SHAPES.some((c) => c.join('>') === shape))
    emergent.push(warn('privacy.warn.chain.combinationFingerprint'));
  for (const [purpose, idx] of used) {
    if (idx.length < 2) continue;
    const profile = p.layers.transport[purpose] ?? 'direct';
    if (profile === 'direct') reveals.add('privacy.warn.timingNotHidden');
    if (RELAY_LIKE.includes(purpose))
      emergent.push({ ...warn('privacy.warn.chain.samePartyManySteps', idx), detail: purpose });
  }
  for (const i of emergent) reveals.add(i.key);

  return {
    cost: {
      perStep,
      totalFeeBpsMax: compound(maxFees, 'ceil'),
      totalFeeBpsMin: compound(minFees, 'floor'),
      singleStepBaselineBps: SWEEP_RELAYER_FEE_MIN_BPS,
    },
    latency: { minMs, maxMs, creditedDwellMs: credited, appOpenRequired: appOpen, signaturePrompts: prompts },
    trust: [...trust].sort(),
    strength: [...strength].sort(),
    reveals: [...reveals].sort(),
    issues: [...v.blocking, ...v.warnings, ...emergent],
    requiredAcks: v.requiredAcks,
    amountLadderBps: ladder,
  };
}
