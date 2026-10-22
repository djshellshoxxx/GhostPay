import { ABCopy, type ABCopyKey, AB_NOT_PROTECTED } from './copy.js';
import { fail } from './errors.js';
import type { BlurMode } from './types.js';

/** Inputs of {@link estimateCrowd}. No defaults: the event rate must be supplied or measured (AB-H3). */
export interface CrowdEstimateInput {
  readonly eventsPerDay: number;
  readonly windowDays: number;
  readonly amountBuckets: number;
}

/** Coarse crowd label. */
export type CrowdLabel = 'none' | 'tiny' | 'small' | 'larger';

/**
 * Research 10.2 estimate of how many payments could be confused with one: `A = eventsPerDay * windowDays / amountBuckets`.
 *
 * @remarks `A` is an expected count of similar-looking events under uniform assumptions [U]. It is NOT an
 * anonymity score and must not be shown as one; UIs show only `label` (see {@link honestyMeter}).
 * Label: `none` if `A < 2`, `tiny` if `< 10`, `small` if `< 100`, else `larger`.
 * @param i Rates and window; all finite, `eventsPerDay >= 0`, `windowDays > 0`, `amountBuckets >= 1`.
 * @returns Estimate and label.
 * @throws {AmountBlurError} `INVALID_INPUT` for missing, non-finite or out-of-range inputs.
 */
export function estimateCrowd(i: CrowdEstimateInput): { readonly A: number; readonly label: CrowdLabel } {
  const e = i?.eventsPerDay;
  const w = i?.windowDays;
  const b = i?.amountBuckets;
  if (typeof e !== 'number' || !Number.isFinite(e) || e < 0) fail('INVALID_INPUT', 'eventsPerDay');
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) fail('INVALID_INPUT', 'windowDays');
  if (typeof b !== 'number' || !Number.isFinite(b) || b < 1) fail('INVALID_INPUT', 'amountBuckets');
  const A = (e * w) / b;
  const label: CrowdLabel = A < 2 ? 'none' : A < 10 ? 'tiny' : A < 100 ? 'small' : 'larger';
  return { A, label };
}

/** Honesty meter shown next to every non-Off mode. Contains no numeric score. */
export interface HonestyMeter {
  readonly crowd: CrowdLabel | 'unknown';
  /** Plain crowd sentence. */
  readonly crowdText: string;
  /** Copy keys the UI must render, `AB_NOT_ANONYMOUS` first. */
  readonly notices: readonly ABCopyKey[];
  /** The rendered notice strings, same order as `notices`. */
  readonly lines: readonly string[];
  /** The normative does-NOT-protect list. */
  readonly notProtected: readonly string[];
}

/** Inputs of {@link honestyMeter}. */
export interface HonestyInput {
  readonly mode: BlurMode;
  /** Measured or user-supplied rates. Omit when unknown. */
  readonly crowd?: CrowdEstimateInput | undefined;
  /** Number of parts (split/denom). */
  readonly k?: number | undefined;
  /** Span of the plan in seconds (split/denom). */
  readonly windowSec?: number | undefined;
}

const CROWD_TEXT: Readonly<Record<CrowdLabel | 'unknown', string>> = {
  unknown: 'Crowd size unknown: assume none.',
  none: 'Estimated crowd: none. Blurring changes almost nothing here.',
  tiny: 'Estimated crowd: tiny. Blurring changes little.',
  small: 'Estimated crowd: small. Blurring helps only a little.',
  larger: 'Estimated crowd: larger, based on the rates you gave. This is an estimate, not a guarantee.',
};

/**
 * Builds the honesty meter for a mode (AB-HON).
 *
 * @security No numeric anonymity or privacy score is produced; only a coarse label and fixed text.
 * With no supplied rate the label is `unknown` and the text says to assume no crowd (AB-H3).
 * @param i Mode and optional crowd inputs.
 * @returns The meter, or `null` for mode `off` (nothing to qualify).
 * @throws {AmountBlurError} `INVALID_INPUT` for bad crowd inputs.
 */
export function honestyMeter(i: HonestyInput): HonestyMeter | null {
  if (i.mode === 'off') return null;
  const crowd: CrowdLabel | 'unknown' = i.crowd === undefined ? 'unknown' : estimateCrowd(i.crowd).label;
  const notices: ABCopyKey[] = ['AB_NOT_ANONYMOUS'];
  const multi = i.mode === 'split' || i.mode === 'denom';
  if (i.mode === 'round') notices.push('AB_ROUND_UP');
  if (multi) notices.push('AB_COST_GAS', 'AB_FEE_DELTA');
  if (multi && (i.k ?? 2) > 1 && (i.windowSec === undefined || i.windowSec < 86_400)) notices.push('AB_FANOUT_LINKABLE');
  if (i.mode !== 'round') notices.push('AB_TAB_OPEN');
  return Object.freeze({
    crowd,
    crowdText: CROWD_TEXT[crowd],
    notices: Object.freeze(notices),
    lines: Object.freeze(notices.map((n) => ABCopy[n])),
    notProtected: AB_NOT_PROTECTED,
  });
}
