import { bigintIn, intIn, msg, type MessageRef } from './amount.js';
import { fail } from './errors.js';

/** Advice level. `ok` means "no strong reason either way". */
export type SweepAdvice = 'now' | 'wait' | 'ok';
/** Honest confidence in the advice. */
export type Confidence = 'low' | 'medium' | 'high';

/** Input for {@link adviseSweepTiming}. */
export interface SweepTimingInput {
  /** Gas-price samples in wei, oldest first, evenly spaced (max 5000). Local data only. */
  readonly history: readonly bigint[];
  /** Injected clock, unix seconds. */
  readonly now: bigint;
  /** Time of the newest sample; used for the staleness check. */
  readonly newestSampleAt?: bigint;
  /** Seconds between samples (display of the window length only). */
  readonly sampleIntervalSeconds?: number;
  /** Current gas price in wei; defaults to the newest sample. */
  readonly current?: bigint;
  /** Gas units of the sweep, to express the fee in native units. */
  readonly gasUnits?: bigint;
  /** Value being swept in native wei (only meaningful when the swept asset is the native asset). */
  readonly valueNative?: bigint;
  /** `urgent` never yields `wait`. */
  readonly urgency?: 'normal' | 'urgent';
  /** When the payment was received (unix seconds), for the privacy note. */
  readonly receivedAt?: bigint;
  /** How the sweep gas is paid. */
  readonly fundingMethod?: 'self' | 'sponsored';
  /** Whether random timing jitter is enabled in settings. */
  readonly timingJitter?: boolean;
  /** Minimum samples for a non-low confidence. Default 24. */
  readonly minSamples?: number;
  /** Samples older than this make the history stale. Default 900 s. */
  readonly maxSampleAgeSeconds?: bigint;
}

/** Percentile summary in wei. */
export interface PercentileSummary {
  readonly p10: bigint;
  readonly p25: bigint;
  readonly p50: bigint;
  readonly p75: bigint;
  readonly p90: bigint;
}

/** Result of {@link adviseSweepTiming}. */
export interface SweepTimingAdvice {
  readonly advice: SweepAdvice;
  readonly confidence: Confidence;
  readonly current: bigint;
  /** Mid-rank of `current` within the window in bps (0 = cheapest ever seen, 10000 = dearest). */
  readonly rankBps: number;
  readonly percentiles: PercentileSummary;
  readonly sampleCount: number;
  readonly trend: 'rising' | 'falling' | 'flat' | 'unknown';
  /** `gasUnits * current` when `gasUnits` was given. */
  readonly estimatedFeeNative?: bigint;
  /** `(current - p25) * gasUnits` when waiting might help: a typical-low comparison, NOT a forecast. */
  readonly typicalLowSavingNative?: bigint;
  /** Sweep fee in bps of the swept value when both inputs exist. */
  readonly feeBpsOfValue?: number;
  readonly reasons: readonly MessageRef[];
  /** Always non-empty: the honest limits of this heuristic. */
  readonly limits: readonly MessageRef[];
  /** Privacy notes about sweep timing. */
  readonly privacy: readonly MessageRef[];
}

/** Fee below this share of the swept value (bps) is treated as not worth timing. */
const NEGLIGIBLE_FEE_BPS = 10n;
const RECENT_PRIVACY_WINDOW_SECONDS = 600n;

/**
 * Nearest-rank percentile on an ascending array.
 *
 * @param sorted Non-empty ascending values.
 * @param p Percentile `1..100`.
 * @returns The value.
 */
export function percentile(sorted: readonly bigint[], p: number): bigint {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] as bigint;
}

function median(xs: readonly bigint[]): bigint {
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return percentile(s, 50);
}

function lower(c: Confidence): Confidence {
  return c === 'high' ? 'medium' : 'low';
}

/**
 * Advises whether to sweep now, wait, or whether it does not matter, from a LOCAL gas-price history.
 *
 * @remarks Heuristic, deliberately simple: the mid-rank of the current price in the window decides
 * (`<= 25 %` -> now, `>= 75 %` -> wait, otherwise a >= 25 % recent trend nudges it). Overrides: too little
 * history (`< minSamples`) or a flat history -> `ok`/low; fee under 0.10 % of the swept value -> `ok`;
 * `urgent` never waits. Confidence drops with few samples, high volatility (p90 > 3x median) and stale data.
 * It does NOT predict the future, knows nothing about mempool or upcoming blocks, assumes samples are evenly
 * spaced, and the window may not include your usual busy/quiet cycle. `typicalLowSavingNative` compares with
 * the window's 25th percentile; the price may never get there.
 * Privacy: sweeping immediately after receipt lets an observer link the receiving and destination
 * addresses by timing; fee-driven waiting helps incidentally but a fixed, predictable schedule is itself a pattern.
 * @security No network, no timers. Inputs are validated; the advice never alters the amount or destination
 * and must not be used to auto-sweep without user consent.
 *
 * @param input History, clock and optional context.
 * @returns Advice with reasons, limits and privacy notes (i18n keys).
 * @throws {UxFeesError} INVALID_INPUT for empty/oversized/invalid history or bad options.
 */
export function adviseSweepTiming(input: SweepTimingInput): SweepTimingAdvice {
  const h = input.history as unknown;
  if (!Array.isArray(h) || h.length === 0 || h.length > 5000)
    return fail('history must have 1..5000 samples');
  const history = h as readonly unknown[];
  for (const v of history) bigintIn(v, 'history sample', 1n, 10n ** 18n);
  const hist = history as readonly bigint[];
  bigintIn(input.now, 'now');
  const minSamples = input.minSamples === undefined ? 24 : intIn(input.minSamples, 'minSamples', 4, 5000);
  const maxAge =
    input.maxSampleAgeSeconds === undefined
      ? 900n
      : bigintIn(input.maxSampleAgeSeconds, 'maxSampleAgeSeconds', 1n, 604_800n);
  if (input.sampleIntervalSeconds !== undefined)
    intIn(input.sampleIntervalSeconds, 'sampleIntervalSeconds', 1, 86_400);
  if (input.gasUnits !== undefined) bigintIn(input.gasUnits, 'gasUnits', 1n, 30_000_000n);
  if (input.valueNative !== undefined) bigintIn(input.valueNative, 'valueNative', 1n);
  const current =
    input.current === undefined
      ? (hist[hist.length - 1] as bigint)
      : bigintIn(input.current, 'current', 1n, 10n ** 18n);
  if (input.newestSampleAt !== undefined) bigintIn(input.newestSampleAt, 'newestSampleAt');
  if (input.receivedAt !== undefined) bigintIn(input.receivedAt, 'receivedAt');

  const n = hist.length;
  const sorted = [...hist].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const percentiles: PercentileSummary = {
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
  };
  let less = 0;
  let equal = 0;
  for (const v of hist) {
    if (v < current) less += 1;
    else if (v === current) equal += 1;
  }
  const rankBps = Math.floor(((2 * less + equal) * 10_000) / (2 * n));

  let trend: SweepTimingAdvice['trend'] = 'unknown';
  if (n >= 8) {
    const q = Math.floor(n / 4);
    const recent = median(hist.slice(n - q));
    const prev = median(hist.slice(n - 2 * q, n - q));
    trend = recent * 100n >= prev * 125n ? 'rising' : recent * 125n <= prev * 100n ? 'falling' : 'flat';
  }

  const reasons: MessageRef[] = [];
  const limits: MessageRef[] = [
    msg('fees.timing.limit.notAPrediction'),
    msg('fees.timing.limit.localHistoryOnly', { samples: n }),
  ];
  if (input.sampleIntervalSeconds !== undefined) {
    limits.push(
      msg('fees.timing.limit.windowLength', { minutes: Math.round((n * input.sampleIntervalSeconds) / 60) }),
    );
  }

  const estimatedFeeNative = input.gasUnits === undefined ? undefined : input.gasUnits * current;
  const feeBps =
    estimatedFeeNative !== undefined && input.valueNative !== undefined
      ? (estimatedFeeNative * 10_000n) / input.valueNative
      : undefined;

  // confidence
  let confidence: Confidence = n < minSamples ? 'low' : n < minSamples * 4 ? 'medium' : 'high';
  if (percentiles.p90 * 100n > percentiles.p50 * 300n) {
    confidence = lower(confidence);
    limits.push(msg('fees.timing.limit.volatile'));
  }
  const stale =
    input.newestSampleAt !== undefined &&
    input.now > input.newestSampleAt &&
    input.now - input.newestSampleAt > maxAge;
  if (stale) {
    confidence = lower(confidence);
    limits.push(msg('fees.timing.limit.staleHistory'));
  }

  let advice: SweepAdvice = 'ok';
  if (n < minSamples) {
    reasons.push(msg('fees.timing.reason.insufficientHistory', { have: n, need: minSamples }));
    confidence = 'low';
  } else if (percentiles.p90 === percentiles.p10) {
    reasons.push(msg('fees.timing.reason.flatHistory'));
  } else if (feeBps !== undefined && feeBps < NEGLIGIBLE_FEE_BPS) {
    reasons.push(msg('fees.timing.reason.feeNegligible'));
  } else if (rankBps <= 2500) {
    advice = 'now';
    reasons.push(msg('fees.timing.reason.lowVsRecent', { rankPct: Math.round(rankBps / 100) }));
  } else if (rankBps >= 7500) {
    if (input.urgency === 'urgent') {
      reasons.push(msg('fees.timing.reason.highButUrgent', { rankPct: Math.round(rankBps / 100) }));
    } else {
      advice = 'wait';
      reasons.push(msg('fees.timing.reason.highVsRecent', { rankPct: Math.round(rankBps / 100) }));
    }
  } else if (trend === 'rising') {
    advice = 'now';
    reasons.push(msg('fees.timing.reason.risingTrend'));
  } else if (trend === 'falling' && input.urgency !== 'urgent') {
    advice = 'wait';
    reasons.push(msg('fees.timing.reason.fallingTrend'));
  } else {
    reasons.push(msg('fees.timing.reason.midRange'));
  }

  // privacy
  const privacy: MessageRef[] = [msg('fees.timing.privacy.timingLinksAddresses')];
  const delay =
    input.receivedAt !== undefined && input.now >= input.receivedAt
      ? input.now - input.receivedAt
      : undefined;
  if (delay !== undefined && delay < RECENT_PRIVACY_WINDOW_SECONDS) {
    privacy.push(msg('fees.timing.privacy.immediateSweepCorrelates', { minutes: Number(delay / 60n) }));
  }
  if (input.timingJitter === false) privacy.push(msg('fees.timing.privacy.enableJitter'));
  if (input.fundingMethod === 'self') privacy.push(msg('fees.timing.privacy.selfFundedGasLinks'));
  if (input.fundingMethod === 'sponsored') privacy.push(msg('fees.timing.privacy.sponsoredRelayerSees'));
  if (advice === 'wait') privacy.push(msg('fees.timing.privacy.waitingHelpsButNotGuaranteed'));
  privacy.push(msg('fees.timing.privacy.avoidFixedSchedule'));

  const out: { -readonly [K in keyof SweepTimingAdvice]: SweepTimingAdvice[K] } = {
    advice,
    confidence,
    current,
    rankBps,
    percentiles,
    sampleCount: n,
    trend,
    reasons,
    limits,
    privacy,
  };
  if (estimatedFeeNative !== undefined) out.estimatedFeeNative = estimatedFeeNative;
  if (feeBps !== undefined) out.feeBpsOfValue = Number(feeBps);
  if (advice === 'wait' && input.gasUnits !== undefined && current > percentiles.p25) {
    out.typicalLowSavingNative = (current - percentiles.p25) * input.gasUnits;
  }
  return out;
}
