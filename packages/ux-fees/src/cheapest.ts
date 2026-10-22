import { bigintIn, ceilDiv, intIn, msg, ownGet, type MessageRef } from './amount.js';
import { fail } from './errors.js';

/** Mirrors `FeeStatus` of packages/chain-adapters (copied, not imported). */
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

/**
 * One chain's fee quote as plain data. Shaped after `ChainConfig` + `FeeCapability` + the inputs of
 * `calculateBuffer` in packages/chain-adapters (chainId, nativeSymbol, finalityDepth, blockTimeMs, enabled,
 * checkout status/bps, gas units, max fee per gas). Structurally typed: nothing is imported from there.
 */
export interface ChainFeeQuote {
  readonly chainId: number;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
  readonly enabled: boolean;
  /** Estimated gas units of the payment transaction, `1..30_000_000`. */
  readonly gasUnits: bigint;
  /** Max fee per gas in wei, `1..10^15`. */
  readonly maxFeePerGas: bigint;
  readonly checkout: FeeStatus;
  /** Required when `checkout === 'enforced'`, integer `0..1000`. */
  readonly checkoutBps?: number;
  readonly blockTimeMs: number;
  readonly finalityDepth: number;
  /** Unix seconds when this quote was taken. */
  readonly quotedAt: bigint;
}

/** Injected price: fiat major units per 1 whole asset = `answer / 10^decimals`. */
export interface FiatRate {
  readonly answer: bigint;
  readonly decimals: number;
  /** Unix seconds of the observation. */
  readonly asOf: bigint;
}

/** Injected rates (e.g. from ux-fiat). Optional: without them only same-asset comparison is possible. */
export interface CheapestRates {
  readonly fiatCurrency: string;
  /** Native symbol -> fiat price (own keys only). */
  readonly native: Readonly<Record<string, FiatRate>>;
  /** Price of the payment token. */
  readonly token: FiatRate;
}

/** The payment being routed. */
export interface CheapestPayment {
  /** Gross payment in token base units (same token on every chain; 6-decimal stablecoin assumed identical). */
  readonly gross: bigint;
  readonly tokenDecimals: number;
}

/** Options (all times in unix seconds, injected: this module never reads a clock). */
export interface CheapestOptions {
  readonly now: bigint;
  /** Quotes older than this are excluded. Default 120. */
  readonly maxQuoteAgeSeconds?: bigint;
  /** Rates older than this are ignored (fiat unavailable). Default 3600. */
  readonly maxRateAgeSeconds?: bigint;
  /** Tolerated future timestamp skew. Default 60. */
  readonly maxFutureSkewSeconds?: bigint;
  /** Candidates within this many bps of the cheapest form a tie group. Default 100 (1 %). */
  readonly tieToleranceBps?: number;
  /** Preferred chain, wins a tie group. */
  readonly preferredChainId?: number;
  /** Chain the user is on now: enables the stay/switch suggestion. */
  readonly currentChainId?: number;
  /** Chains the recipient actually accepts; others are excluded. */
  readonly supportedChainIds?: readonly number[];
  /** Minimum saving vs the current chain (bps of the current cost) to suggest switching. Default 500. */
  readonly switchThresholdBps?: number;
}

/** Why a quote did not qualify. */
export type ExclusionReason =
  | 'invalid_quote'
  | 'duplicate_chain'
  | 'chain_disabled'
  | 'checkout_not_deployed'
  | 'quote_stale'
  | 'quote_from_future'
  | 'recipient_unsupported';

/** An excluded chain. */
export interface Exclusion {
  readonly chainId: number | null;
  readonly reason: ExclusionReason;
  readonly message: MessageRef;
}

/** A qualifying chain with its computed costs. */
export interface RankedChain {
  readonly chainId: number;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
  /** `gasUnits * maxFeePerGas` in wei (worst case, as quoted). */
  readonly networkFeeNative: bigint;
  /** Router fee in token base units (0 when not enforceable). */
  readonly checkoutFeeToken: bigint;
  /** Fiat micro-units (1e-6 of a major unit), rounded UP, when every needed rate is fresh. */
  readonly networkFiatMicro?: bigint;
  readonly checkoutFiatMicro?: bigint;
  readonly totalFiatMicro?: bigint;
  /** Time to the chain's finality depth in whole seconds (rounded up). */
  readonly confirmSeconds: number;
  readonly ageSeconds: bigint;
  readonly notes: readonly MessageRef[];
}

/** How the winner was chosen. */
export type CompareMode = 'fiat' | 'native' | 'single' | 'none' | 'incomparable';

/** Savings in a unit. */
export interface Savings {
  readonly unit: 'fiatMicro' | 'native';
  readonly amount: bigint;
}

/** Result of {@link suggestCheapestChain}. */
export interface CheapestResult {
  readonly status: 'ok' | 'incomparable' | 'none';
  readonly mode: CompareMode;
  readonly fiatCurrency?: string;
  /** Best chain first; empty when `status !== 'ok'` ordering is by chainId. */
  readonly ranked: readonly RankedChain[];
  readonly bestChainId?: number;
  readonly excluded: readonly Exclusion[];
  /** Explain-why keys for the headline decision. */
  readonly why: readonly MessageRef[];
  readonly warnings: readonly MessageRef[];
  readonly savingsVsNext?: Savings;
  readonly suggestion?: 'stay' | 'switch';
  readonly savingsVsCurrent?: Savings;
}

const ID = /^[A-Z0-9]{1,12}$/;
const BPS = 10_000n;
const MICRO = 1_000_000n;

interface Valid {
  readonly q: ChainFeeQuote;
  readonly networkFee: bigint;
  readonly checkoutFee: bigint;
  readonly confirmSeconds: number;
}

function quoteValid(q: unknown): q is ChainFeeQuote {
  if (typeof q !== 'object' || q === null) return false;
  const o = q as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number): boolean =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
  const big = (v: unknown, lo: bigint, hi: bigint): boolean => typeof v === 'bigint' && v >= lo && v <= hi;
  if (!int(o['chainId'], 1, 2 ** 53 - 1)) return false;
  if (typeof o['name'] !== 'string' || o['name'].length === 0 || o['name'].length > 64) return false;
  if (typeof o['nativeSymbol'] !== 'string' || !ID.test(o['nativeSymbol'])) return false;
  if (!int(o['nativeDecimals'], 0, 36)) return false;
  if (typeof o['enabled'] !== 'boolean') return false;
  if (!big(o['gasUnits'], 1n, 30_000_000n)) return false;
  if (!big(o['maxFeePerGas'], 1n, 10n ** 15n)) return false;
  if (o['checkout'] !== 'enforced' && o['checkout'] !== 'not_enforceable' && o['checkout'] !== 'not_deployed')
    return false;
  if (o['checkout'] === 'enforced' && !int(o['checkoutBps'], 0, 1000)) return false;
  if (o['checkoutBps'] !== undefined && !int(o['checkoutBps'], 0, 1000)) return false;
  if (!int(o['blockTimeMs'], 1, 3_600_000)) return false;
  if (!int(o['finalityDepth'], 0, 100_000)) return false;
  return big(o['quotedAt'], 0n, 1n << 62n);
}

function validRate(r: FiatRate | undefined, now: bigint, maxAge: bigint, skew: bigint): r is FiatRate {
  if (r === undefined || typeof r !== 'object') return false;
  if (typeof r.answer !== 'bigint' || r.answer <= 0n || r.answer > 1n << 128n) return false;
  if (!Number.isInteger(r.decimals) || r.decimals < 0 || r.decimals > 30) return false;
  if (typeof r.asOf !== 'bigint' || r.asOf <= 0n) return false;
  if (r.asOf > now + skew) return false;
  return now <= r.asOf || now - r.asOf <= maxAge;
}

/** Rounds UP: `ceil(units * answer * 1e6 / (10^rateDecimals * 10^assetDecimals))`. */
function toFiatMicro(units: bigint, assetDecimals: number, r: FiatRate): bigint {
  if (units === 0n) return 0n;
  return ceilDiv(units * r.answer * MICRO, 10n ** BigInt(r.decimals) * 10n ** BigInt(assetDecimals));
}

function checkOptions(opts: CheapestOptions): {
  maxQuoteAge: bigint;
  maxRateAge: bigint;
  skew: bigint;
  tolBps: bigint;
  thresholdBps: bigint;
} {
  bigintIn(opts.now, 'now');
  const maxQuoteAge =
    opts.maxQuoteAgeSeconds === undefined
      ? 120n
      : bigintIn(opts.maxQuoteAgeSeconds, 'maxQuoteAgeSeconds', 1n, 86_400n);
  const maxRateAge =
    opts.maxRateAgeSeconds === undefined
      ? 3600n
      : bigintIn(opts.maxRateAgeSeconds, 'maxRateAgeSeconds', 1n, 604_800n);
  const skew =
    opts.maxFutureSkewSeconds === undefined
      ? 60n
      : bigintIn(opts.maxFutureSkewSeconds, 'maxFutureSkewSeconds', 0n, 3600n);
  const tolBps = BigInt(
    opts.tieToleranceBps === undefined ? 100 : intIn(opts.tieToleranceBps, 'tieToleranceBps', 0, 5000),
  );
  const thresholdBps = BigInt(
    opts.switchThresholdBps === undefined
      ? 500
      : intIn(opts.switchThresholdBps, 'switchThresholdBps', 0, 10_000),
  );
  return { maxQuoteAge, maxRateAge, skew, tolBps, thresholdBps };
}

/**
 * Compares fee quotes across chains and suggests the cheapest.
 *
 * @remarks Pure, bigint-only, no clock, no network. Cost of a chain = worst-case network fee
 * (`gasUnits * maxFeePerGas`, native wei) + checkout fee (`floor(gross * bps / 10_000)`, token units,
 * identical to the router's floor rounding; 0 when the chain cannot enforce it). Native and token amounts
 * are only added when fresh injected fiat rates exist for EVERY qualifying chain (fiat mode, rounded up to
 * micro-units). Otherwise, if all qualifying chains share one native asset the network fee is compared in
 * native wei (native mode; the token fee is not added and a warning says so when it differs). Otherwise
 * the result is `incomparable`: no winner is invented. Tie-break: chains within `tieToleranceBps` of the
 * cheapest form a group; the preferred chain wins, then the lowest time-to-finality, then the lowest chain id.
 * Quotes are excluded (never thrown) when invalid, duplicated (all copies), disabled, without a deployed
 * checkout, stale (`now - quotedAt > maxQuoteAge`), dated in the future beyond the skew, or unsupported by the recipient.
 * @security Quotes and rates are untrusted-shape data: every field is validated; symbol keys are looked
 * up as own properties only. The result is advice; the signing path must re-validate fees (this does not
 * replace `assertSponsorFeeAcceptable` or the router's on-chain rule).
 *
 * @param quotes Per-chain quotes (max 64).
 * @param payment Gross amount and token decimals.
 * @param opts Clock and policy options.
 * @param rates Optional injected fiat rates.
 * @returns Ranking, exclusions and explain-why keys.
 * @throws {UxFeesError} INVALID_INPUT for a non-array, >64 quotes, or invalid payment/options.
 */
export function suggestCheapestChain(
  quotes: readonly ChainFeeQuote[],
  payment: CheapestPayment,
  opts: CheapestOptions,
  rates?: CheapestRates,
): CheapestResult {
  if (!Array.isArray(quotes) || quotes.length > 64) return fail('quotes must be an array of at most 64');
  bigintIn(payment.gross, 'gross', 0n);
  intIn(payment.tokenDecimals, 'tokenDecimals', 0, 36);
  const { maxQuoteAge, maxRateAge, skew, tolBps, thresholdBps } = checkOptions(opts);
  const supported = opts.supportedChainIds === undefined ? undefined : new Set(opts.supportedChainIds);

  const excluded: Exclusion[] = [];
  const counts = new Map<number, number>();
  for (const q of quotes as readonly unknown[]) {
    if (quoteValid(q)) counts.set(q.chainId, (counts.get(q.chainId) ?? 0) + 1);
  }

  const valid: Valid[] = [];
  const warnings: MessageRef[] = [];
  const dupReported = new Set<number>();
  for (const q of quotes as readonly unknown[]) {
    if (!quoteValid(q)) {
      excluded.push({
        chainId: null,
        reason: 'invalid_quote',
        message: msg('fees.cheapest.excluded.invalidQuote'),
      });
      continue;
    }
    const exclude = (
      reason: ExclusionReason,
      key: string,
      params: Record<string, string | number> = {},
    ): void => {
      excluded.push({ chainId: q.chainId, reason, message: msg(key, { chain: q.name, ...params }) });
    };
    if ((counts.get(q.chainId) ?? 0) > 1) {
      if (!dupReported.has(q.chainId)) {
        dupReported.add(q.chainId);
        exclude('duplicate_chain', 'fees.cheapest.excluded.duplicate');
      }
      continue;
    }
    if (supported !== undefined && !supported.has(q.chainId)) {
      exclude('recipient_unsupported', 'fees.cheapest.excluded.recipientUnsupported');
      continue;
    }
    if (!q.enabled) {
      exclude('chain_disabled', 'fees.cheapest.excluded.disabled');
      continue;
    }
    if (q.checkout === 'not_deployed') {
      exclude('checkout_not_deployed', 'fees.cheapest.excluded.checkoutNotDeployed');
      continue;
    }
    if (q.quotedAt > opts.now + skew) {
      exclude('quote_from_future', 'fees.cheapest.excluded.fromFuture');
      continue;
    }
    if (opts.now > q.quotedAt && opts.now - q.quotedAt > maxQuoteAge) {
      exclude('quote_stale', 'fees.cheapest.excluded.stale', {
        ageSeconds: Number(opts.now - q.quotedAt),
        maxSeconds: Number(maxQuoteAge),
      });
      continue;
    }
    const bps = q.checkout === 'enforced' ? BigInt(q.checkoutBps ?? 0) : 0n;
    valid.push({
      q,
      networkFee: q.gasUnits * q.maxFeePerGas,
      checkoutFee: (payment.gross * bps) / BPS,
      confirmSeconds: Math.ceil((q.blockTimeMs * q.finalityDepth) / 1000),
    });
  }
  excluded.sort((a, b) => (a.chainId ?? 0) - (b.chainId ?? 0));

  if (valid.length === 0) {
    return {
      status: 'none',
      mode: 'none',
      ranked: [],
      excluded,
      why: [msg('fees.cheapest.why.noneEligible')],
      warnings,
    };
  }

  // --- pricing -----------------------------------------------------------------------------
  const tokenRate =
    rates !== undefined && validRate(rates.token, opts.now, maxRateAge, skew) ? rates.token : undefined;
  const priced = new Map<number, { network: bigint; checkout: bigint }>();
  const missingSymbols = new Set<string>();
  if (rates !== undefined) {
    for (const v of valid) {
      const nr = ownGet(rates.native, v.q.nativeSymbol);
      const nativeOk = validRate(nr, opts.now, maxRateAge, skew);
      if (!nativeOk) {
        missingSymbols.add(v.q.nativeSymbol);
        continue;
      }
      if (v.checkoutFee > 0n && tokenRate === undefined) continue;
      priced.set(v.q.chainId, {
        network: toFiatMicro(v.networkFee, v.q.nativeDecimals, nr),
        checkout:
          v.checkoutFee === 0n || tokenRate === undefined
            ? 0n
            : toFiatMicro(v.checkoutFee, payment.tokenDecimals, tokenRate),
      });
    }
    if (tokenRate === undefined) warnings.push(msg('fees.cheapest.warn.tokenRateUnavailable'));
    if (missingSymbols.size > 0)
      warnings.push(
        msg('fees.cheapest.warn.nativeRateUnavailable', { symbols: [...missingSymbols].sort().join(',') }),
      );
  }

  const allPriced = rates !== undefined && valid.every((v) => priced.has(v.q.chainId));
  const sameAsset = valid.every(
    (v) => v.q.nativeSymbol === valid[0]?.q.nativeSymbol && v.q.nativeDecimals === valid[0].q.nativeDecimals,
  );

  const rank = (v: Valid): RankedChain => {
    const p = priced.get(v.q.chainId);
    const notes: MessageRef[] = [];
    if (v.q.checkout === 'not_enforceable') notes.push(msg('fees.cheapest.note.noCheckoutFee'));
    return {
      chainId: v.q.chainId,
      name: v.q.name,
      nativeSymbol: v.q.nativeSymbol,
      nativeDecimals: v.q.nativeDecimals,
      networkFeeNative: v.networkFee,
      checkoutFeeToken: v.checkoutFee,
      ...(allPriced && p !== undefined
        ? {
            networkFiatMicro: p.network,
            checkoutFiatMicro: p.checkout,
            totalFiatMicro: p.network + p.checkout,
          }
        : {}),
      confirmSeconds: v.confirmSeconds,
      ageSeconds: opts.now > v.q.quotedAt ? opts.now - v.q.quotedAt : 0n,
      notes,
    };
  };

  let mode: CompareMode;
  let cost: (v: Valid) => bigint;
  if (valid.length === 1) {
    mode = 'single';
    cost = () => 0n;
  } else if (allPriced) {
    mode = 'fiat';
    cost = (v) => {
      const p = priced.get(v.q.chainId);
      return p === undefined ? 0n : p.network + p.checkout;
    };
  } else if (sameAsset) {
    mode = 'native';
    cost = (v) => v.networkFee;
    if (new Set(valid.map((v) => v.checkoutFee)).size > 1)
      warnings.push(msg('fees.cheapest.warn.tokenFeeNotCompared'));
  } else {
    mode = 'incomparable';
    cost = () => 0n;
  }

  if (mode === 'incomparable') {
    const ranked = valid.map(rank).sort((a, b) => a.chainId - b.chainId);
    return {
      status: 'incomparable',
      mode,
      ranked,
      excluded,
      why: [msg('fees.cheapest.why.incomparable')],
      warnings,
    };
  }

  // --- selection ---------------------------------------------------------------------------
  const sorted = [...valid].sort((a, b) => {
    const ca = cost(a);
    const cb = cost(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    if (a.confirmSeconds !== b.confirmSeconds) return a.confirmSeconds - b.confirmSeconds;
    return a.q.chainId - b.q.chainId;
  });
  const first = sorted[0] as Valid;
  const minCost = cost(first);
  const group = sorted.filter((v) => cost(v) - minCost <= ceilDiv(minCost * tolBps, BPS));
  const why: MessageRef[] = [];
  let winner: Valid = first;
  if (mode === 'single') {
    why.push(msg('fees.cheapest.why.onlyOption', { chain: first.q.name }));
  } else if (group.length === 1) {
    why.push(
      msg(mode === 'fiat' ? 'fees.cheapest.why.lowestTotal' : 'fees.cheapest.why.lowestNetworkFee', {
        chain: first.q.name,
      }),
    );
  } else {
    why.push(msg('fees.cheapest.why.nearTie', { count: group.length, tolerancePct: Number(tolBps) / 100 }));
    const pref =
      opts.preferredChainId === undefined
        ? undefined
        : group.find((v) => v.q.chainId === opts.preferredChainId);
    if (pref !== undefined) {
      winner = pref;
      why.push(msg('fees.cheapest.why.tieBrokenByPreference', { chain: pref.q.name }));
    } else {
      const fastest = Math.min(...group.map((v) => v.confirmSeconds));
      const fastGroup = group.filter((v) => v.confirmSeconds === fastest);
      winner = fastGroup.reduce((a, b) => (a.q.chainId <= b.q.chainId ? a : b));
      why.push(
        fastGroup.length === 1
          ? msg('fees.cheapest.why.tieBrokenBySpeed', { chain: winner.q.name, seconds: fastest })
          : msg('fees.cheapest.why.tieBrokenById', { chain: winner.q.name }),
      );
    }
  }
  if (winner.q.checkout === 'not_enforceable') why.push(msg('fees.cheapest.why.winnerHasNoCheckoutFee'));
  why.push(msg('fees.cheapest.note.recipientMustAcceptChain', { chain: winner.q.name }));
  if (mode === 'native')
    why.push(msg('fees.cheapest.why.unpricedSameAsset', { symbol: winner.q.nativeSymbol }));
  if (mode === 'fiat') why.push(msg('fees.cheapest.why.fiatEstimateIsWorstCase'));

  const rest = sorted.filter((v) => v !== winner);
  const ranked = [winner, ...rest].map(rank);
  const unit: Savings['unit'] = mode === 'fiat' ? 'fiatMicro' : 'native';
  const metric = (v: Valid): bigint => (mode === 'fiat' ? cost(v) : v.networkFee);

  const result: {
    -readonly [K in keyof CheapestResult]: CheapestResult[K];
  } = {
    status: 'ok',
    mode,
    ranked,
    bestChainId: winner.q.chainId,
    excluded,
    why,
    warnings,
  };
  if (mode === 'fiat' && rates !== undefined) result.fiatCurrency = rates.fiatCurrency;
  const next = rest[0];
  if (next !== undefined && mode !== 'single')
    result.savingsVsNext = { unit, amount: metric(next) - metric(winner) };

  if (opts.currentChainId !== undefined && mode !== 'single') {
    const cur = valid.find((v) => v.q.chainId === opts.currentChainId);
    if (cur === undefined) {
      warnings.push(msg('fees.cheapest.warn.currentChainUnavailable'));
    } else {
      const saving = metric(cur) - metric(winner);
      result.savingsVsCurrent = { unit, amount: saving > 0n ? saving : 0n };
      const worth = winner !== cur && saving > 0n && saving * BPS >= metric(cur) * thresholdBps;
      result.suggestion = worth ? 'switch' : 'stay';
      why.push(msg(worth ? 'fees.cheapest.why.switchWorthIt' : 'fees.cheapest.why.stayGoodEnough'));
    }
  }
  return result;
}
