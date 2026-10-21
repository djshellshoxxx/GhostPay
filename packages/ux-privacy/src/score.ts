import { fail } from './errors.js';

/** Whether the gas for the receiving/spending account came from a wallet linked to the user. */
export type GasFunding = 'unlinked' | 'linked' | 'unknown';

/** Plain facts about the user's recent activity. All counts are integers; nothing is fetched. */
export interface PrivacyFacts {
  /** How many times a receive address was used again after its first use (0 = never reused). */
  readonly addressReuseCount: number;
  /** Other deposits of exactly the same amount in the same pool (0 = this amount is unique). */
  readonly amountMatchCount: number;
  /** True if the amount withdrawn equals the amount deposited (to the unit). */
  readonly inOutAmountEqual: boolean;
  /** Seconds between deposit and withdrawal; `null` = no withdrawal yet / unknown. */
  readonly secondsBetweenInAndOut: number | null;
  /** Was gas funded from a wallet that can be linked to you? */
  readonly gasFunding: GasFunding;
  /** True if a relayer submitted the transaction. */
  readonly relayerUsed: boolean;
  /** Number of equivalent deposits that could plausibly be yours; `null` = unknown. */
  readonly anonymitySetSize: number | null;
}

/** Factor identifiers, in display order. */
export type FactorId =
  'addressReuse' | 'amountCorrelation' | 'timing' | 'gasFunding' | 'relayer' | 'anonymitySet';

/** Per-factor, explainable result. */
export interface FactorResult {
  readonly id: FactorId;
  /** Weight in the total (all weights sum to 100). */
  readonly weight: number;
  /** Factor score, 0 (worst) to 100 (best). */
  readonly score: number;
  /** Points this factor contributes to the total before caps (`weight * score / 100`). */
  readonly points: number;
  /** False if the input was unknown and a cautious default was used. */
  readonly known: boolean;
  /** i18n key for the explanation. */
  readonly explanationKey: string;
  /** Plain-English explanation (fallback text). */
  readonly explanation: string;
}

/** One ranked, actionable suggestion. */
export interface Advice {
  /** 1 = most valuable. */
  readonly rank: number;
  readonly factor: FactorId;
  /** i18n key. */
  readonly key: string;
  /** Plain-English fallback text. */
  readonly text: string;
  /** Upper bound of points the total could gain if this factor reached 100. */
  readonly potentialGain: number;
}

/** A rule that limits the total regardless of the weighted sum. */
export interface ScoreCap {
  readonly id: 'smallCrowd' | 'neverAnonymous';
  readonly max: number;
  readonly reason: string;
}

/** Coarse label for the score. Deliberately never says "anonymous" or "private". */
export type ScoreBand = 'exposed' | 'weak' | 'fair' | 'careful';

/** Result of {@link computePrivacyScore}. */
export interface PrivacyReport {
  /** Integer 0-100, at most {@link MAX_SCORE}. */
  readonly score: number;
  readonly band: ScoreBand;
  /** Weighted sum before caps, rounded. */
  readonly rawScore: number;
  readonly factors: readonly FactorResult[];
  readonly caps: readonly ScoreCap[];
  /** Advice sorted by `potentialGain` descending. */
  readonly advice: readonly Advice[];
  /** Honest limits; always non-empty, must be shown next to the score. */
  readonly limits: readonly string[];
}

/** Highest score ever reported: this tool cannot prove anonymity. */
export const MAX_SCORE = 90;
/** Overall cap when the anonymity set is below {@link SMALL_CROWD}. */
export const SMALL_CROWD_CAP = 60;
/** Anonymity-set size below which {@link SMALL_CROWD_CAP} applies. */
export const SMALL_CROWD = 10;

const MAX_COUNT = 1_000_000_000;
const MAX_SECONDS = 10 * 365 * 24 * 3600;

/** Fixed disclaimers returned with every report. */
export const PRIVACY_LIMITS: readonly string[] = Object.freeze([
  'This score is a heuristic over the facts you provided, not a measurement of how traceable you are.',
  'It cannot see off-chain data such as exchange records, IP addresses or what the people you pay know about you.',
  'A high score means fewer known mistakes, never that you are anonymous.',
  'Analysis techniques improve over time; past activity cannot be made private retroactively.',
]);

/** @internal Integer in [0, max] or throws. */
function count(value: unknown, field: string, max = MAX_COUNT): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    return fail(field);
  return value;
}

/** @internal Strict validation of untrusted facts. */
function validate(f: PrivacyFacts): PrivacyFacts {
  if (typeof f !== 'object' || f === null) return fail('facts');
  const gas: unknown = f.gasFunding;
  if (gas !== 'unlinked' && gas !== 'linked' && gas !== 'unknown') return fail('gasFunding');
  if (typeof f.inOutAmountEqual !== 'boolean') return fail('inOutAmountEqual');
  if (typeof f.relayerUsed !== 'boolean') return fail('relayerUsed');
  return {
    addressReuseCount: count(f.addressReuseCount, 'addressReuseCount'),
    amountMatchCount: count(f.amountMatchCount, 'amountMatchCount'),
    inOutAmountEqual: f.inOutAmountEqual,
    secondsBetweenInAndOut:
      f.secondsBetweenInAndOut === null
        ? null
        : count(f.secondsBetweenInAndOut, 'secondsBetweenInAndOut', MAX_SECONDS),
    gasFunding: gas,
    relayerUsed: f.relayerUsed,
    anonymitySetSize: f.anonymitySetSize === null ? null : count(f.anonymitySetSize, 'anonymitySetSize'),
  };
}

interface Scored {
  score: number;
  known: boolean;
  tier: string;
  text: string;
}

/** @internal Picks the first tier whose bound exceeds the value. */
function tiered(
  value: number,
  tiers: readonly (readonly [number, number, string])[],
  last: readonly [number, string],
) {
  for (const [bound, score, tier] of tiers) if (value < bound) return { score, tier };
  return { score: last[0], tier: last[1] };
}

const WEIGHTS: Readonly<Record<FactorId, number>> = {
  addressReuse: 20,
  amountCorrelation: 15,
  timing: 15,
  gasFunding: 20,
  relayer: 10,
  anonymitySet: 20,
};
const ORDER: readonly FactorId[] = [
  'addressReuse',
  'amountCorrelation',
  'timing',
  'gasFunding',
  'relayer',
  'anonymitySet',
];

/** @internal */
function scoreReuse(f: PrivacyFacts): Scored {
  const t = tiered(
    f.addressReuseCount,
    [
      [1, 100, 'none'],
      [2, 60, 'once'],
      [3, 35, 'twice'],
      [5, 15, 'several'],
    ],
    [0, 'many'],
  );
  const text =
    f.addressReuseCount === 0
      ? 'No address was reused, so your payments are not grouped under one address.'
      : `A receive address was reused ${String(f.addressReuseCount)} time(s); everything sent to it is trivially linked.`;
  return { ...t, known: true, text };
}

/** @internal */
function scoreAmount(f: PrivacyFacts): Scored {
  const t = tiered(
    f.amountMatchCount,
    [
      [1, 10, 'unique'],
      [5, 40, 'few'],
      [20, 70, 'some'],
    ],
    [90, 'many'],
  );
  const score = f.inOutAmountEqual ? Math.max(0, t.score - 25) : t.score;
  const text =
    `${String(f.amountMatchCount)} other deposit(s) share your exact amount` +
    (f.inOutAmountEqual ? '; the amount out equals the amount in, which makes the pair easy to match.' : '.');
  return { score, known: true, tier: f.inOutAmountEqual ? `${t.tier}-equal` : t.tier, text };
}

/** @internal */
function scoreTiming(f: PrivacyFacts): Scored {
  const s = f.secondsBetweenInAndOut;
  if (s === null) {
    return {
      score: 40,
      known: false,
      tier: 'unknown',
      text: 'Timing is unknown; a cautious middle value was used.',
    };
  }
  const t = tiered(
    s,
    [
      [3600, 10, 'minutes'],
      [6 * 3600, 30, 'hours'],
      [24 * 3600, 55, 'day'],
      [72 * 3600, 75, 'days'],
      [7 * 24 * 3600, 90, 'week'],
    ],
    [95, 'long'],
  );
  return {
    ...t,
    known: true,
    text: `${String(Math.floor(s / 60))} minute(s) passed between deposit and withdrawal.`,
  };
}

/** @internal */
function scoreGas(f: PrivacyFacts): Scored {
  if (f.gasFunding === 'linked') {
    return {
      score: 0,
      known: true,
      tier: 'linked',
      text: 'Gas came from a wallet linked to you, which ties the accounts together.',
    };
  }
  if (f.gasFunding === 'unknown') {
    return {
      score: 40,
      known: false,
      tier: 'unknown',
      text: 'Gas funding is unknown; a cautious middle value was used.',
    };
  }
  return {
    score: 100,
    known: true,
    tier: 'unlinked',
    text: 'Gas was not funded from a wallet linked to you.',
  };
}

/** @internal */
function scoreRelayer(f: PrivacyFacts): Scored {
  return f.relayerUsed
    ? {
        score: 100,
        known: true,
        tier: 'used',
        text: 'A relayer submitted the transaction, so your wallet did not pay gas directly.',
      }
    : {
        score: 25,
        known: true,
        tier: 'unused',
        text: 'No relayer was used, so your own wallet appears as the transaction sender.',
      };
}

/** @internal */
function scoreCrowd(f: PrivacyFacts): Scored {
  const n = f.anonymitySetSize;
  if (n === null) {
    return {
      score: 30,
      known: false,
      tier: 'unknown',
      text: 'Crowd size is unknown; a cautious low value was used.',
    };
  }
  const t = tiered(
    n,
    [
      [2, 0, 'alone'],
      [10, 20, 'tiny'],
      [50, 45, 'small'],
      [200, 65, 'medium'],
      [1000, 80, 'large'],
    ],
    [90, 'huge'],
  );
  return { ...t, known: true, text: `About ${String(n)} equivalent deposit(s) could plausibly be yours.` };
}

const ADVICE: Readonly<Record<FactorId, string>> = {
  addressReuse: 'Use a fresh receive address for every payment and never reuse one.',
  amountCorrelation:
    'Use common amounts shared by many others, and withdraw a different amount than you deposited (for example in smaller parts).',
  timing:
    'Wait longer between depositing and withdrawing; days is better than minutes, and avoid a fixed schedule.',
  gasFunding:
    'Do not fund gas from a wallet linked to you; use a relayer or a gas source that is not tied to your identity.',
  relayer: 'Submit transactions through a relayer instead of paying gas from your own wallet.',
  anonymitySet:
    'Wait until more people have used the same pool and amount before withdrawing, or choose a busier pool.',
};

/** @internal */
function bandOf(score: number): ScoreBand {
  if (score < 25) return 'exposed';
  if (score < 50) return 'weak';
  if (score < 75) return 'fair';
  return 'careful';
}

/**
 * Computes the privacy hygiene score and an explainable breakdown.
 *
 * @remarks Weighted sum of six factors (weights 20/15/15/20/10/20), then caps: never above
 * {@link MAX_SCORE}, and never above {@link SMALL_CROWD_CAP} when the anonymity set is known to be
 * below {@link SMALL_CROWD}. Unknown inputs are scored cautiously and flagged `known: false`.
 * Pure and deterministic: no clock, no randomness, no network.
 *
 * @param facts Plain facts, validated strictly.
 * @returns Report with factors, caps, ranked advice and the mandatory limits text.
 * @throws {UxPrivacyError} `INVALID_INPUT` for any malformed field.
 * @security Never claims anonymity: the band names are `exposed|weak|fair|careful`, the score is
 * capped at 90 and {@link PRIVACY_LIMITS} accompany every report. The facts describe the user's
 * own activity; the caller must keep them local and never transmit them.
 */
export function computePrivacyScore(input: PrivacyFacts): PrivacyReport {
  const f = validate(input);
  const scored: Record<FactorId, Scored> = {
    addressReuse: scoreReuse(f),
    amountCorrelation: scoreAmount(f),
    timing: scoreTiming(f),
    gasFunding: scoreGas(f),
    relayer: scoreRelayer(f),
    anonymitySet: scoreCrowd(f),
  };
  const factors: FactorResult[] = ORDER.map((id) => {
    const s = scored[id];
    const weight = WEIGHTS[id];
    return {
      id,
      weight,
      score: s.score,
      points: (weight * s.score) / 100,
      known: s.known,
      explanationKey: `privacy.factor.${id}.${s.tier}`,
      explanation: s.text,
    };
  });
  const rawScore = Math.round(factors.reduce((a, x) => a + x.points, 0));
  const caps: ScoreCap[] = [
    { id: 'neverAnonymous', max: MAX_SCORE, reason: 'No score can prove anonymity, so the maximum is 90.' },
  ];
  if (f.anonymitySetSize !== null && f.anonymitySetSize < SMALL_CROWD) {
    caps.push({
      id: 'smallCrowd',
      max: SMALL_CROWD_CAP,
      reason: 'With fewer than 10 equivalent deposits, a small crowd limits everything else.',
    });
  }
  const score = Math.min(rawScore, ...caps.map((c) => c.max));
  const advice: Advice[] = factors
    .map((x) => ({ x, gain: x.weight - x.points }))
    .filter(({ x, gain }) => x.score < 80 && gain > 0)
    .sort((a, b) => b.gain - a.gain || ORDER.indexOf(a.x.id) - ORDER.indexOf(b.x.id))
    .map(({ x, gain }, i) => ({
      rank: i + 1,
      factor: x.id,
      key: `privacy.advice.${x.id}`,
      text: ADVICE[x.id],
      potentialGain: gain,
    }));
  return Object.freeze({
    score,
    band: bandOf(score),
    rawScore,
    factors: Object.freeze(factors),
    caps: Object.freeze(caps),
    advice: Object.freeze(advice),
    limits: PRIVACY_LIMITS,
  });
}
