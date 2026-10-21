import { fail } from './errors.js';

/**
 * BIP-78 optional sender query parameters ("Optional parameters" section of
 * the raw BIP, retrieved 2026-10-21).
 */
export interface PayjoinParams {
  readonly v: 1 | 2;
  readonly additionalFeeOutputIndex?: number;
  readonly maxAdditionalFeeContributionSats?: bigint;
  readonly minFeeRateSatPerVb?: number;
  readonly disableOutputSubstitution: boolean;
}

/** Default parameters: v1, no fee output, substitution allowed. */
export const DEFAULT_PARAMS: PayjoinParams = Object.freeze({ v: 1, disableOutputSubstitution: false });

/** Fills a partial parameter set. */
export function withDefaults(p?: Partial<PayjoinParams>): PayjoinParams {
  return { ...DEFAULT_PARAMS, ...(p ?? {}) };
}

/**
 * Serialises sender parameters to a query string (no leading `?`).
 *
 * @remarks Always emits `v`. `additionalfeeoutputindex` and
 * `maxadditionalfeecontribution` are emitted together or not at all, because
 * BIP-78 requires both to be specified and valid for the receiver to touch a
 * sender output.
 */
export function serializeParams(p: PayjoinParams): string {
  const q = new URLSearchParams();
  q.set('v', String(p.v));
  if (p.additionalFeeOutputIndex !== undefined && p.maxAdditionalFeeContributionSats !== undefined) {
    if (!Number.isInteger(p.additionalFeeOutputIndex) || p.additionalFeeOutputIndex < 0) fail('uri_invalid');
    if (p.maxAdditionalFeeContributionSats < 0n) fail('uri_invalid');
    q.set('additionalfeeoutputindex', String(p.additionalFeeOutputIndex));
    q.set('maxadditionalfeecontribution', p.maxAdditionalFeeContributionSats.toString());
  }
  if (p.minFeeRateSatPerVb !== undefined) {
    if (!Number.isFinite(p.minFeeRateSatPerVb) || p.minFeeRateSatPerVb < 0) fail('uri_invalid');
    q.set('minfeerate', String(p.minFeeRateSatPerVb));
  }
  if (p.disableOutputSubstitution) q.set('disableoutputsubstitution', 'true');
  return q.toString();
}

const DECIMAL = /^\d+$/;
const FEERATE = /^\d+(\.\d+)?$/;

/**
 * Parses receiver-side query parameters.
 *
 * @remarks Malformed optional values are ignored (treated as absent), as BIP-78
 * says to do for out-of-range `maxadditionalfeecontribution`. Only an
 * unsupported `v` is an error.
 * @throws {PayjoinError} `version_unsupported` when `v` is not 1 (receiver supports v1 here).
 */
export function parseParams(query: string): PayjoinParams {
  const q = new URLSearchParams(query);
  const vRaw = q.get('v');
  let v: 1 | 2 = 1;
  if (vRaw !== null) {
    if (vRaw !== '1') fail('version_unsupported');
    v = 1;
  }
  const idxRaw = q.get('additionalfeeoutputindex');
  const maxRaw = q.get('maxadditionalfeecontribution');
  const idx = idxRaw !== null && DECIMAL.test(idxRaw) && idxRaw.length <= 9 ? Number(idxRaw) : undefined;
  const max = maxRaw !== null && DECIMAL.test(maxRaw) && maxRaw.length <= 16 ? BigInt(maxRaw) : undefined;
  const mfrRaw = q.get('minfeerate');
  const mfr = mfrRaw !== null && FEERATE.test(mfrRaw) && mfrRaw.length <= 12 ? Number(mfrRaw) : undefined;
  const dis = q.get('disableoutputsubstitution') === 'true';
  return {
    v,
    ...(idx !== undefined && max !== undefined
      ? { additionalFeeOutputIndex: idx, maxAdditionalFeeContributionSats: max }
      : {}),
    ...(mfr !== undefined ? { minFeeRateSatPerVb: mfr } : {}),
    disableOutputSubstitution: dis,
  };
}
