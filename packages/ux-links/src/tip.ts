import { fail } from './errors.js';
import { formatAmount, parseAmount, validateAsset, MAX_DECIMALS } from './amount.js';
import { assertHandle } from './handle.js';
import { validateText } from './text.js';
import { validateMetaAddress } from './target.js';
import { buildPaymentUri } from './uri.js';
import { exactRecord, isPosInt } from './validate.js';

/** Maximum number of suggested amounts on a tip page. */
export const MAX_PRESETS = 6;

/** Receiver-authored tip/donation page configuration. */
export interface TipConfig {
  readonly title: string;
  readonly description?: string;
  /** Optional local handle shown on the page. */
  readonly handle?: string;
  readonly target: string;
  readonly asset: string;
  readonly decimals: number;
  readonly chainId?: number;
  /** Strictly ascending canonical decimal amounts, 1..6. */
  readonly suggested: readonly string[];
  /** Smallest accepted custom amount (default: one atomic unit). */
  readonly minAmount?: string;
  /** Largest accepted custom amount (default: unbounded up to 2^128-1 atomic). */
  readonly maxAmount?: string;
  readonly goal?: { readonly target: string; readonly deadline?: number; readonly label?: string };
}

/** Locally computed progress input (the receiver's own ledger; nothing is fetched). */
export interface TipState {
  /** Total raised, canonical decimal string, may be "0". */
  readonly raised: string;
}

/** Pure view-model for rendering. Contains no identifiers, timestamps of viewers or tracking fields. */
export interface TipPageModel {
  readonly title: string;
  readonly description: string | null;
  readonly handle: string | null;
  readonly target: string;
  readonly asset: string;
  readonly decimals: number;
  readonly chainId: number | null;
  readonly presets: readonly { readonly amount: string; readonly uri: string }[];
  readonly custom: { readonly min: string; readonly max: string | null };
  readonly goal: null | {
    readonly label: string | null;
    readonly target: string;
    readonly raised: string;
    readonly remaining: string;
    /** Integer 0..100 (floor, capped). */
    readonly percent: number;
    readonly reached: boolean;
    readonly overBy: string;
    readonly secondsRemaining: number | null;
    /** Deadline passed (informational; payments are not blocked). */
    readonly closed: boolean;
  };
}

const KEYS = [
  'title',
  'description',
  'handle',
  'target',
  'asset',
  'decimals',
  'chainId',
  'suggested',
  'minAmount',
  'maxAmount',
  'goal',
];
const MAX_ATOMIC = (1n << 128n) - 1n;

/**
 * Builds the tip page view-model from config, local state and an injected clock.
 *
 * @remarks Pure data: callers render it as text. Amounts are compared in
 * atomic units (bigint), never floats. `percent` is floored and capped at 100;
 * `reached` and `overBy` express over-funding. Each preset carries a ready
 * `ghostpay:` URI (no secrets, no tracking parameters).
 * @param config Page configuration (validated strictly).
 * @param state Locally computed progress.
 * @param nowSeconds Injected unix clock (non-negative safe integer).
 * @throws {LinkError} `TIP` / `AMOUNT` / `TEXT` / `HANDLE` / `TARGET`.
 * @security No analytics, no viewer identifiers, no third-party fields. Text is
 * validated against bidi/zero-width spoofing and must be rendered as text only.
 * @testVector tip-goal
 */
export function buildTipPageModel(config: TipConfig, state: TipState, nowSeconds: number): TipPageModel {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return fail('TIP', 'now');
  const c = exactRecord(config, KEYS, ['title', 'target', 'asset', 'decimals', 'suggested'], 'TIP', 'config');
  const decimals = c['decimals'];
  if (
    typeof decimals !== 'number' ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > MAX_DECIMALS
  ) {
    return fail('TIP', 'decimals');
  }
  const title = validateText(c['title'], 80, 'TEXT', 'title');
  const description =
    c['description'] === undefined ? null : validateText(c['description'], 500, 'TEXT', 'description');
  const handle = c['handle'] === undefined ? null : assertHandle(c['handle']).handle;
  const target = validateMetaAddress(c['target']);
  const asset = validateAsset(c['asset']);
  let chainId: number | undefined;
  if (c['chainId'] !== undefined) {
    if (!isPosInt(c['chainId'])) return fail('TIP', 'chainId');
    chainId = c['chainId'];
  }

  const min = c['minAmount'] === undefined ? 1n : parseAmount(c['minAmount'], decimals);
  const max = c['maxAmount'] === undefined ? null : parseAmount(c['maxAmount'], decimals);
  if (max !== null && max < min) return fail('TIP', 'maxAmount');

  const sug = c['suggested'];
  if (!Array.isArray(sug) || sug.length < 1 || sug.length > MAX_PRESETS) return fail('TIP', 'suggested');
  let prev = 0n;
  const presets = (sug as unknown[]).map((a) => {
    const v = parseAmount(a, decimals);
    if (v <= prev || v < min || (max !== null && v > max)) return fail('TIP', 'suggested');
    prev = v;
    const amount = a as string;
    return {
      amount,
      uri: buildPaymentUri({ target, amount, asset, ...(chainId !== undefined ? { chainId } : {}) }),
    };
  });

  let goal: TipPageModel['goal'] = null;
  if (c['goal'] !== undefined) {
    const g = exactRecord(c['goal'], ['target', 'deadline', 'label'], ['target'], 'TIP', 'goal');
    const gt = parseAmount(g['target'], decimals);
    const raised = parseAmount(state.raised, decimals, { allowZero: true });
    let secondsRemaining: number | null = null;
    if (g['deadline'] !== undefined) {
      if (!isPosInt(g['deadline'])) return fail('TIP', 'deadline');
      secondsRemaining = Math.max(0, g['deadline'] - nowSeconds);
    }
    const reached = raised >= gt;
    const pct = reached ? 100n : (raised * 100n) / gt;
    goal = {
      label: g['label'] === undefined ? null : validateText(g['label'], 80, 'TEXT', 'goal.label'),
      target: formatAmount(gt, decimals),
      raised: formatAmount(raised, decimals),
      remaining: formatAmount(reached ? 0n : gt - raised, decimals),
      percent: Number(pct),
      reached,
      overBy: formatAmount(reached ? raised - gt : 0n, decimals),
      secondsRemaining,
      closed: secondsRemaining === 0,
    };
  }

  return {
    title,
    description,
    handle,
    target,
    asset,
    decimals,
    chainId: chainId ?? null,
    presets,
    custom: { min: formatAmount(min, decimals), max: max === null ? null : formatAmount(max, decimals) },
    goal,
  };
}

/**
 * Builds the payment URI for a custom tip amount, enforcing the page's min/max.
 *
 * @param model Model from {@link buildTipPageModel}.
 * @param amount Canonical decimal string entered by the payer.
 * @throws {LinkError} `TIP` if outside the allowed range; `AMOUNT` if malformed.
 * @security Untrusted payer input.
 */
export function tipUri(model: TipPageModel, amount: string): string {
  const v = parseAmount(amount, model.decimals);
  const min = parseAmount(model.custom.min, model.decimals);
  const max = model.custom.max === null ? MAX_ATOMIC : parseAmount(model.custom.max, model.decimals);
  if (v < min || v > max) return fail('TIP', 'amount');
  return buildPaymentUri({
    target: model.target,
    amount,
    asset: model.asset,
    ...(model.chainId !== null ? { chainId: model.chainId } : {}),
  });
}
