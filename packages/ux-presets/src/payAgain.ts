import {
  err,
  ok,
  type AddressRisk,
  type DraftFlag,
  type PayAgainOptions,
  type PayContext,
  type PaymentDraft,
  type PaymentRecord,
  type Preset,
  type Result,
} from './types.js';
import {
  isAddressShape,
  isNonNegativeAmount,
  isPositiveAmount,
  isRisk,
  validatePreset,
  validateRecord,
} from './validate.js';

export const DEFAULT_FEE_TOLERANCE_BPS = 500;
export const DEFAULT_STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

const RISK_RANK: Record<Exclude<AddressRisk, 'unknown'>, number> = { none: 0, low: 1, medium: 2, high: 3 };

interface Base {
  readonly payeeRef: string;
  readonly chain: string;
  readonly asset: string;
  readonly amount: bigint | null;
  readonly maxAmount: bigint | null;
  readonly privacyProfile: string;
  readonly memo: string;
  readonly prevAddress: string | null;
  readonly prevFee: bigint | null;
  readonly prevRisk: AddressRisk | null;
  readonly ageMs: number | null;
  readonly source: PaymentDraft['source'];
}

function checkContext(ctx: PayContext, opts: PayAgainOptions): Result<{ tol: bigint; stale: number }> {
  const bad = (m: string) => err<{ tol: bigint; stale: number }>('invalid-context', m);
  if (typeof ctx !== 'object' || ctx === null) return bad('context');
  if (!Number.isInteger(ctx.now) || ctx.now < 0) return bad('now');
  if (typeof ctx.validateAddress !== 'function') return bad('validateAddress');
  if (ctx.supported !== undefined && typeof ctx.supported !== 'function') return bad('supported');
  if (!isRisk(ctx.addressRisk)) return bad('addressRisk');
  if (ctx.quotedFee !== null && !isNonNegativeAmount(ctx.quotedFee)) return bad('quotedFee');
  if (ctx.resolvedAddress !== null && typeof ctx.resolvedAddress !== 'string') return bad('resolvedAddress');
  const tol = opts.feeToleranceBps ?? DEFAULT_FEE_TOLERANCE_BPS;
  if (!Number.isInteger(tol) || tol < 0 || tol > 10_000) return bad('feeToleranceBps');
  const stale = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  if (!Number.isInteger(stale) || stale < 0) return bad('staleAfterMs');
  return ok({ tol: BigInt(tol), stale });
}

function safeValidateAddress(ctx: PayContext, chain: string, address: string): boolean {
  try {
    return ctx.validateAddress(chain, address) === true;
  } catch {
    return false;
  }
}

function safeSupported(ctx: PayContext, chain: string, asset: string): boolean {
  if (ctx.supported === undefined) return true;
  try {
    return ctx.supported(chain, asset) === true;
  } catch {
    return false;
  }
}

function buildDraft(base: Base, ctx: PayContext, opts: PayAgainOptions): Result<PaymentDraft> {
  const c = checkContext(ctx, opts);
  if (!c.ok) return c;
  if (!safeSupported(ctx, base.chain, base.asset))
    return err('chain-mismatch', 'chain or asset not supported');
  const address = ctx.resolvedAddress;
  if (address === null) return err('payee-mismatch', 'payee no longer resolves to an address');
  if (!isAddressShape(address) || !safeValidateAddress(ctx, base.chain, address)) {
    return err('invalid-address', 'resolved address is not valid for the chain');
  }

  const flags: DraftFlag[] = [];

  if (base.prevAddress !== null && base.prevAddress !== address) {
    flags.push({
      code: 'address-changed',
      severity: 'block',
      detail: { previous: base.prevAddress, current: address },
    });
  }

  const risk = ctx.addressRisk;
  if (risk === 'high') {
    flags.push({ code: 'address-risk-high', severity: 'block' });
  } else if (risk === 'unknown') {
    flags.push({ code: 'address-risk-unknown', severity: 'warn' });
  } else if (
    base.prevRisk !== null &&
    base.prevRisk !== 'unknown' &&
    RISK_RANK[risk] > RISK_RANK[base.prevRisk]
  ) {
    flags.push({
      code: 'address-risk-increased',
      severity: 'warn',
      detail: { previous: base.prevRisk, current: risk },
    });
  }

  const fee = ctx.quotedFee;
  if (fee === null) {
    flags.push({ code: 'fee-unavailable', severity: 'warn' });
  } else if (base.prevFee !== null && fee !== base.prevFee) {
    const diff = fee > base.prevFee ? fee - base.prevFee : base.prevFee - fee;
    if (diff * 10_000n > base.prevFee * c.value.tol) {
      flags.push({
        code: 'fee-changed',
        severity: fee > base.prevFee ? 'warn' : 'info',
        detail: { previous: base.prevFee.toString(), current: fee.toString() },
      });
    }
  }

  if (base.ageMs !== null && base.ageMs > c.value.stale) {
    flags.push({ code: 'record-stale', severity: 'info', detail: { ageMs: String(base.ageMs) } });
  }

  return ok({
    autoSend: false,
    requiresReview: true,
    blocked: flags.some((f) => f.severity === 'block'),
    payeeRef: base.payeeRef,
    address,
    chain: base.chain,
    asset: base.asset,
    amount: base.amount,
    maxAmount: base.maxAmount,
    fee,
    privacyProfile: base.privacyProfile,
    memo: base.memo,
    flags,
    source: base.source,
  });
}

/**
 * One-tap "pay again": derive a prefilled draft from a past payment record.
 *
 * Everything is re-validated against the present: the record's shape, the
 * payee's current address (syntax via the injected validator), chain/asset
 * support, a fresh fee quote and the current address risk. The draft always
 * uses the CURRENT resolved address, never the recorded one.
 *
 * @security Never sends. The returned draft has `autoSend: false` and
 * `requiresReview: true` as literal types. A changed address or high risk
 * yields a `block` flag; fee drift beyond tolerance, rising or unknown risk
 * yield `warn`. All inputs, including the record, are treated as untrusted.
 */
export function derivePayAgain(
  record: PaymentRecord,
  ctx: PayContext,
  opts: PayAgainOptions = {},
): Result<PaymentDraft> {
  const r = validateRecord(record);
  if (!r.ok) return r;
  const rec = r.value;
  if (typeof ctx !== 'object' || ctx === null || !Number.isInteger(ctx.now) || ctx.now < 0)
    return err('invalid-context', 'now');
  const age = ctx.now - rec.paidAt;
  if (age < 0) return err('invalid-record', 'record is dated in the future');
  return buildDraft(
    {
      payeeRef: rec.payeeRef,
      chain: rec.chain,
      asset: rec.asset,
      amount: rec.amount,
      maxAmount: null,
      privacyProfile: rec.privacyProfile,
      memo: rec.memo,
      prevAddress: rec.address,
      prevFee: rec.fee,
      prevRisk: rec.addressRisk,
      ageMs: age,
      source: { kind: 'record', id: rec.id },
    },
    ctx,
    opts,
  );
}

/**
 * Apply a saved preset to produce a draft. `amountInput` is required for
 * `ask` rules (optional pre-entry for `up-to`) and forbidden for `fixed`.
 * @security Same guarantees as {@link derivePayAgain}; never sends.
 */
export function presetToDraft(
  preset: Preset,
  ctx: PayContext,
  amountInput?: bigint,
  opts: PayAgainOptions = {},
): Result<PaymentDraft> {
  const p = validatePreset(preset);
  if (!p.ok) return p;
  const rule = p.value.amountRule;
  let amount: bigint | null = null;
  let maxAmount: bigint | null = null;
  if (rule.kind === 'fixed') {
    if (amountInput !== undefined) return err('invalid-amount', 'fixed preset takes no amount');
    amount = rule.amount;
  } else {
    if (amountInput !== undefined) {
      if (!isPositiveAmount(amountInput)) return err('invalid-amount', 'amount must be positive');
      if (rule.kind === 'up-to' && amountInput > rule.max)
        return err('invalid-amount', 'amount exceeds preset cap');
      amount = amountInput;
    }
    if (rule.kind === 'up-to') maxAmount = rule.max;
  }
  return buildDraft(
    {
      payeeRef: p.value.payeeRef,
      chain: p.value.chain,
      asset: p.value.asset,
      amount,
      maxAmount,
      privacyProfile: p.value.privacyProfile,
      memo: p.value.memo,
      prevAddress: null,
      prevFee: null,
      prevRisk: null,
      ageMs: null,
      source: { kind: 'preset', id: p.value.id },
    },
    ctx,
    opts,
  );
}
