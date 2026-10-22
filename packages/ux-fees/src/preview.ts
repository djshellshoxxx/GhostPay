import { bigintIn, ceilDiv, formatUnits, intIn, msg, symbolOf, type MessageRef } from './amount.js';
import { fail } from './errors.js';

/** Mirrors `FeeStatus` of packages/chain-adapters (copied, not imported). */
export type CheckoutStatus = 'enforced' | 'not_enforceable' | 'not_deployed';

/**
 * Fee schedule inputs (docs/FEE_SCHEDULE.md section 2/3). Normally taken from the verified deployment
 * manifest / app config, never from user input.
 */
export interface PreviewFeeSchedule {
  /** F-PAY in bps of gross, floor-rounded, `0..1000`. */
  readonly routerFeeBps: number;
  /** F-SPONSOR floor in bps of the swept amount. */
  readonly sponsorMinBps: number;
  /** F-SPONSOR cap in bps of the swept amount, `<= 1000`. */
  readonly sponsorCapBps: number;
  /** F-SPONSOR gas reimbursement multiplier as a fraction. */
  readonly sponsorGasNum: number;
  readonly sponsorGasDen: number;
}

/**
 * Documented defaults copied from docs/FEE_SCHEDULE.md (25 bps; `max(gas x 110/100, 50 bps)` capped at 300 bps).
 * A drift test compares these with the doc text. The contract constant stays the source of truth.
 */
export const DEFAULT_FEE_SCHEDULE: PreviewFeeSchedule = Object.freeze({
  routerFeeBps: 25,
  sponsorMinBps: 50,
  sponsorCapBps: 300,
  sponsorGasNum: 110,
  sponsorGasDen: 100,
});

/** An asset to display. `id` groups amounts of the same asset in totals. */
export interface PreviewAsset {
  readonly id: string;
  readonly symbol: string;
  readonly decimals: number;
}

/** The user's privacy configuration relevant to this payment. */
export interface PrivacyProfile {
  /** Payment goes to a one-time stealth address. */
  readonly usesStealthAddress: boolean;
  /** How the later sweep pays gas. */
  readonly sweepMode: 'self' | 'sponsored';
  /** Random delay before sweeping is enabled. */
  readonly timingJitter: boolean;
}

/** Input of {@link buildFeePrivacyPreview}. */
export interface FeePreviewInput {
  /** `router` = GhostPayRouter checkout (fee applies); `direct` = pay the stealth address (no GhostPay fee). */
  readonly route: 'router' | 'direct';
  /** Checkout status on the chain; default `enforced`. */
  readonly checkoutStatus?: CheckoutStatus;
  readonly asset: PreviewAsset;
  /** Amount in base units, `>= 1`. */
  readonly amount: bigint;
  /** `gross`: payer sends `amount`, fee is taken from it. `net`: recipient must receive at least `amount`, payer adds the fee. */
  readonly amountMode: 'gross' | 'net';
  readonly feeSchedule: PreviewFeeSchedule;
  /** Fee recipient from the verified manifest (display + sanity only). Required on the router route when a fee applies. */
  readonly feeRecipient?: string;
  /** True only if `feeRecipient` came from a signed deployment manifest that the app verified. */
  readonly recipientFromSignedManifest?: boolean;
  /** Estimated network fee in the chain's native asset. */
  readonly networkFee?: { readonly asset: PreviewAsset; readonly amount: bigint };
  /** Native gas buffer passed through to the stealth address (router only, never charged a fee). */
  readonly gasBuffer?: { readonly asset: PreviewAsset; readonly amount: bigint };
  /** Expected later sponsored sweep, to disclose F-SPONSOR up front. */
  readonly sponsoredSweep?: { readonly expectedAmount: bigint; readonly gasReimbursementTokenUnits: bigint };
  /** Opt-in F-SECURE flat fee (paid now, in its own asset). */
  readonly flatSecurityFee?: { readonly asset: PreviewAsset; readonly amount: bigint };
  readonly privacy: PrivacyProfile;
}

/** Fee line ids (docs/FEE_SCHEDULE.md section 2) plus pass-through lines. */
export type FeeLineId = 'F-PAY' | 'F-SPONSOR' | 'F-SECURE' | 'NETWORK' | 'BUFFER';

/** One itemised line. */
export interface FeeLine {
  readonly id: FeeLineId;
  readonly labelKey: string;
  /** `now`: charged in this payment. `later`: charged at a future sweep from the swept funds. */
  readonly phase: 'now' | 'later';
  /** Who economically bears it. */
  readonly bearer: 'payer' | 'recipient';
  readonly asset: PreviewAsset;
  readonly amount: bigint;
  /** Exact plain-decimal rendering (no locale). */
  readonly display: string;
  /** True when GhostPay (not the network) receives it. */
  readonly goesToGhostPay: boolean;
  /** For F-PAY / F-SPONSOR: schedule in bps. */
  readonly bps?: number;
  /** F-SPONSOR: the most the fee can be, in the same asset. */
  readonly maxAmount?: bigint;
  readonly recipient?: string;
  /** Explain-why / disclosure keys. */
  readonly notes: readonly MessageRef[];
}

/** One asset total. */
export interface AssetTotal {
  readonly assetId: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly amount: bigint;
  readonly display: string;
}

/** A preview warning. `block` means the UI must not let the user continue. */
export interface PreviewWarning {
  readonly severity: 'info' | 'warn' | 'block';
  readonly message: MessageRef;
}

/** Result of {@link buildFeePrivacyPreview}: a view-model, no UI. */
export interface FeePrivacyPreview {
  readonly canProceed: boolean;
  readonly lines: readonly FeeLine[];
  /** What the payer's wallet spends now, per asset (includes the fee, network fee, buffer, flat fee). */
  readonly payerTotals: readonly AssetTotal[];
  /** Gross sent through the checkout / transfer. */
  readonly gross: bigint;
  /** What the stealth address receives from the payment itself. */
  readonly recipientReceives: bigint;
  /** Total GhostPay fee charged now, in `asset` base units (0 when none). */
  readonly ghostPayFeeNow: bigint;
  /** Required disclosure copy keys (FEE_SCHEDULE section 5). */
  readonly disclosure: readonly MessageRef[];
  readonly privacyNotes: readonly MessageRef[];
  readonly warnings: readonly PreviewWarning[];
}

const BPS = 10_000n;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ID = /^[A-Za-z0-9:._-]{1,32}$/;

function checkAsset(a: PreviewAsset, what: string): PreviewAsset {
  if (typeof a !== 'object' || a === null || typeof a.id !== 'string' || !ID.test(a.id))
    return fail(`${what} id`);
  symbolOf(a.symbol, `${what}`);
  intIn(a.decimals, `${what} decimals`, 0, 36);
  return a;
}

function checkSchedule(s: PreviewFeeSchedule): void {
  intIn(s.routerFeeBps, 'routerFeeBps', 0, 1000);
  intIn(s.sponsorMinBps, 'sponsorMinBps', 0, 1000);
  intIn(s.sponsorCapBps, 'sponsorCapBps', 1, 1000);
  intIn(s.sponsorGasNum, 'sponsorGasNum', 1, 1000);
  intIn(s.sponsorGasDen, 'sponsorGasDen', 1, 1000);
}

/** Router fee: `floor(gross * bps / 10_000)`. */
function feeOf(gross: bigint, bps: number): bigint {
  return (gross * BigInt(bps)) / BPS;
}

/** Smallest gross whose net (gross - fee) is at least `net`. */
function grossFor(net: bigint, bps: number): bigint {
  if (bps === 0) return net;
  const denom = BPS - BigInt(bps);
  let g = ceilDiv(net * BPS, denom);
  while (g > 1n && g - 1n - feeOf(g - 1n, bps) >= net) g -= 1n;
  while (g - feeOf(g, bps) < net) g += 1n;
  return g;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function line(l: Omit<FeeLine, 'display'>): FeeLine {
  return { ...l, display: formatUnits(l.amount, l.asset.decimals) };
}

/**
 * Builds the plain-language fee + privacy preview shown before EVERY payment.
 *
 * @remarks Pure view-model: itemised lines with exact bigint amounts and i18n keys, per-asset totals,
 * privacy notes and severity-tagged warnings. Rounding matches the router (`floor(gross * bps / 10_000)`;
 * gross < ceil(10_000 / bps) pays no fee). In `net` mode the payer adds the fee (the recipient may receive
 * up to 1 base unit more than asked because the fee is floor-rounded; an info warning says so). The
 * `direct` route and chains where the checkout fee is `not_enforceable` show NO GhostPay fee line and say
 * why, never an invented zero fee. A `not_deployed` checkout, a zero/oversized amount, a router payment
 * without a well-formed non-zero fee recipient, or a fee recipient not taken from a signed manifest set
 * `canProceed = false` (fail closed).
 * @security Display only: the signing path must independently enforce amounts (contract rule, Sponsor cap).
 * Symbols are validated ASCII; the recipient address is shape-checked, not checksum-verified (no keccak here).
 * No network, no clock, no storage.
 *
 * @param input Fee schedule, amounts, privacy profile.
 * @returns The preview.
 * @throws {UxFeesError} INVALID_INPUT for structurally invalid input (types/ranges).
 */
export function buildFeePrivacyPreview(input: FeePreviewInput): FeePrivacyPreview {
  checkAsset(input.asset, 'asset');
  checkSchedule(input.feeSchedule);
  bigintIn(input.amount, 'amount', 0n);
  if (input.route !== 'router' && input.route !== 'direct') return fail('route');
  if (input.amountMode !== 'gross' && input.amountMode !== 'net') return fail('amountMode');
  const status: CheckoutStatus = input.checkoutStatus ?? 'enforced';
  if (status !== 'enforced' && status !== 'not_enforceable' && status !== 'not_deployed')
    return fail('checkoutStatus');
  if (input.networkFee !== undefined) {
    checkAsset(input.networkFee.asset, 'networkFee asset');
    bigintIn(input.networkFee.amount, 'networkFee');
  }
  if (input.gasBuffer !== undefined) {
    checkAsset(input.gasBuffer.asset, 'gasBuffer asset');
    bigintIn(input.gasBuffer.amount, 'gasBuffer');
  }
  if (input.flatSecurityFee !== undefined) {
    checkAsset(input.flatSecurityFee.asset, 'flatSecurityFee asset');
    bigintIn(input.flatSecurityFee.amount, 'flatSecurityFee');
  }
  if (input.sponsoredSweep !== undefined) {
    bigintIn(input.sponsoredSweep.expectedAmount, 'expectedAmount');
    bigintIn(input.sponsoredSweep.gasReimbursementTokenUnits, 'gasReimbursement');
  }

  const warnings: PreviewWarning[] = [];
  const warn = (
    severity: PreviewWarning['severity'],
    key: string,
    params: Record<string, string | number> = {},
  ): void => {
    warnings.push({ severity, message: msg(key, params) });
  };
  const sched = input.feeSchedule;
  const onRouter = input.route === 'router';
  const feeApplies = onRouter && status === 'enforced' && sched.routerFeeBps > 0;

  if (input.amount === 0n) warn('block', 'fees.preview.warn.zeroAmount');
  if (onRouter && status === 'not_deployed') warn('block', 'fees.preview.warn.checkoutNotDeployed');
  if (sched.routerFeeBps !== DEFAULT_FEE_SCHEDULE.routerFeeBps && feeApplies) {
    warn('warn', 'fees.preview.warn.scheduleDiffersFromDefault', { bps: sched.routerFeeBps });
  }
  if (sched.routerFeeBps > 100 && feeApplies)
    warn('warn', 'fees.preview.warn.feeUnusuallyHigh', { bps: sched.routerFeeBps });

  // --- checkout fee ---------------------------------------------------------------------------
  let gross = input.amount;
  let fee = 0n;
  if (feeApplies && input.amount > 0n) {
    gross = input.amountMode === 'net' ? grossFor(input.amount, sched.routerFeeBps) : input.amount;
    fee = feeOf(gross, sched.routerFeeBps);
  }
  const recipientReceives = gross - fee;
  if (feeApplies && input.amount > 0n) {
    if (fee === 0n) warn('info', 'fees.preview.info.dustNoFee');
    if (input.amountMode === 'net' && recipientReceives > input.amount) {
      warn('info', 'fees.preview.info.roundingExtra', {
        extra: (recipientReceives - input.amount).toString(),
      });
    }
  }

  let recipientOk = true;
  if (feeApplies) {
    const r = input.feeRecipient;
    if (r === undefined || !ADDR.test(r) || /^0x0{40}$/i.test(r)) {
      recipientOk = false;
      warn('block', 'fees.preview.warn.feeRecipientInvalid');
    } else if (input.recipientFromSignedManifest !== true) {
      recipientOk = false;
      warn('block', 'fees.preview.warn.feeRecipientUnverified');
    }
  }

  const lines: FeeLine[] = [];
  const disclosure: MessageRef[] = [];
  if (feeApplies) {
    const rcp = input.feeRecipient;
    lines.push(
      line({
        id: 'F-PAY',
        labelKey: 'fees.preview.line.checkoutFee',
        phase: 'now',
        bearer: input.amountMode === 'net' ? 'payer' : 'recipient',
        asset: input.asset,
        amount: fee,
        goesToGhostPay: true,
        bps: sched.routerFeeBps,
        ...(recipientOk && rcp !== undefined ? { recipient: rcp } : {}),
        notes: [msg('fees.preview.note.checkoutFeeFloor')],
      }),
    );
    disclosure.push(
      msg('fees.preview.disclosure.router', {
        pct: formatUnits(BigInt(sched.routerFeeBps), 2),
        recipient: recipientOk && rcp !== undefined ? shortAddr(rcp) : '',
      }),
    );
  } else if (onRouter && status === 'not_enforceable') {
    disclosure.push(msg('fees.preview.disclosure.notEnforceableHere'));
  } else if (input.route === 'direct') {
    disclosure.push(msg('fees.preview.disclosure.directNoFee'));
  }

  if (input.networkFee !== undefined) {
    lines.push(
      line({
        id: 'NETWORK',
        labelKey: 'fees.preview.line.networkFee',
        phase: 'now',
        bearer: 'payer',
        asset: input.networkFee.asset,
        amount: input.networkFee.amount,
        goesToGhostPay: false,
        notes: [msg('fees.preview.note.networkFeeEstimate')],
      }),
    );
  }
  if (input.gasBuffer !== undefined) {
    if (onRouter) {
      lines.push(
        line({
          id: 'BUFFER',
          labelKey: 'fees.preview.line.gasBuffer',
          phase: 'now',
          bearer: 'payer',
          asset: input.gasBuffer.asset,
          amount: input.gasBuffer.amount,
          goesToGhostPay: false,
          notes: [msg('fees.preview.note.bufferNoFee')],
        }),
      );
    } else {
      warn('warn', 'fees.preview.warn.bufferNeedsRouter');
    }
  }
  if (input.flatSecurityFee !== undefined) {
    lines.push(
      line({
        id: 'F-SECURE',
        labelKey: 'fees.preview.line.securityFee',
        phase: 'now',
        bearer: 'payer',
        asset: input.flatSecurityFee.asset,
        amount: input.flatSecurityFee.amount,
        goesToGhostPay: true,
        notes: [msg('fees.preview.note.securityFeeOptIn')],
      }),
    );
  }
  if (
    input.sponsoredSweep !== undefined &&
    input.privacy.sweepMode === 'sponsored' &&
    input.sponsoredSweep.expectedAmount > 0n
  ) {
    const amt = input.sponsoredSweep.expectedAmount;
    const gasTerm = ceilDiv(
      input.sponsoredSweep.gasReimbursementTokenUnits * BigInt(sched.sponsorGasNum),
      BigInt(sched.sponsorGasDen),
    );
    const minTerm = ceilDiv(amt * BigInt(sched.sponsorMinBps), BPS);
    const cap = (amt * BigInt(sched.sponsorCapBps)) / BPS;
    const want = gasTerm > minTerm ? gasTerm : minTerm;
    lines.push(
      line({
        id: 'F-SPONSOR',
        labelKey: 'fees.preview.line.sponsoredSweepFee',
        phase: 'later',
        bearer: 'recipient',
        asset: input.asset,
        amount: want > cap ? cap : want,
        goesToGhostPay: true,
        bps: sched.sponsorCapBps,
        maxAmount: cap,
        notes: [
          msg('fees.preview.note.sponsorFeeCapped', { capPct: formatUnits(BigInt(sched.sponsorCapBps), 2) }),
        ],
      }),
    );
  }

  // --- totals (what the payer's wallet spends now) -------------------------------------------
  const totals = new Map<string, AssetTotal>();
  const add = (asset: PreviewAsset, amount: bigint): void => {
    const prev = totals.get(asset.id);
    const sum = (prev?.amount ?? 0n) + amount;
    totals.set(asset.id, {
      assetId: asset.id,
      symbol: asset.symbol,
      decimals: asset.decimals,
      amount: sum,
      display: formatUnits(sum, asset.decimals),
    });
  };
  add(input.asset, gross);
  for (const l of lines) {
    if (l.phase === 'now' && l.id !== 'F-PAY') add(l.asset, l.amount);
  }
  // Asset id collisions with different decimals would make totals meaningless.
  for (const l of lines) {
    const t = totals.get(l.asset.id);
    if (t !== undefined && t.decimals !== l.asset.decimals) warn('block', 'fees.preview.warn.assetMismatch');
  }
  if (input.networkFee !== undefined && input.networkFee.asset.id === input.asset.id && gross > 0n) {
    if (input.networkFee.amount * 10n > gross) warn('warn', 'fees.preview.warn.networkFeeLargeVsAmount');
  }

  // --- privacy ---------------------------------------------------------------------------------
  const privacyNotes: MessageRef[] = [];
  const p = input.privacy;
  if (!p.usesStealthAddress) privacyNotes.push(msg('fees.preview.privacy.noStealthLinksRecipient'));
  else privacyNotes.push(msg('fees.preview.privacy.stealthHidesRecipient'));
  privacyNotes.push(msg('fees.preview.privacy.amountPublic'));
  if (onRouter) {
    privacyNotes.push(msg('fees.preview.privacy.routerEventPublic'));
    if (feeApplies) privacyNotes.push(msg('fees.preview.privacy.feeRecipientPublic'));
  }
  if (input.gasBuffer !== undefined && onRouter) privacyNotes.push(msg('fees.preview.privacy.bufferVisible'));
  if (p.sweepMode === 'sponsored') privacyNotes.push(msg('fees.preview.privacy.sponsoredRelayerSees'));
  else privacyNotes.push(msg('fees.preview.privacy.selfSweepGasLink'));
  if (!p.timingJitter) privacyNotes.push(msg('fees.preview.privacy.enableJitter'));
  if (!p.usesStealthAddress) warn('warn', 'fees.preview.warn.noStealth');

  const canProceed = !warnings.some((w) => w.severity === 'block');
  return {
    canProceed,
    lines,
    payerTotals: [...totals.values()],
    gross,
    recipientReceives,
    ghostPayFeeNow: fee,
    disclosure,
    privacyNotes,
    warnings,
  };
}
