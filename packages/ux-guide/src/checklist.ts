/**
 * Pre-send safety checklist and address-review prompts, evaluated from plain
 * input data.
 *
 * Severity model:
 * - blocker: must be fixed (or completed) before sending; never overridable.
 * - warning: sending is allowed only after the user explicitly acknowledges it.
 *
 * @security Fail-closed: malformed input produces an `input_invalid` blocker,
 * never a pass. Addresses are compared after strict normalization; addresses
 * with whitespace, control, zero-width or non-ASCII characters are rejected
 * (homoglyph / invisible-character spoofing). No network access: address
 * validity (checksum, network) is supplied by the host as booleans.
 */

import { settingsFor, type AddressReviewMode, type ProfileId, isProfileId } from './profiles.js';

/** Where the recipient address came from. */
export type AddressSource = 'typed' | 'pasted' | 'link' | 'qr' | 'contact';
const SOURCES: readonly string[] = ['typed', 'pasted', 'link', 'qr', 'contact'];

/** A known address (contact or previous recipient) used for look-alike detection. */
export interface KnownAddress {
  readonly address: string;
  readonly label: string;
}

/** Plain input to {@link evaluateChecklist}. Amounts are base-unit digit strings. */
export interface SendCheckInput {
  readonly recipient: {
    readonly address: string;
    readonly source: AddressSource;
    /** Host-verified checksum/format validity for the target network. */
    readonly valid: boolean;
    readonly network: string;
    readonly inContacts: boolean;
    readonly previouslyPaid: boolean;
    /** Host detected the address changed between paste/scan and submit. */
    readonly changedSinceEntry: boolean;
  };
  readonly wallet: { readonly network: string; readonly ownAddresses: readonly string[] };
  readonly amount: {
    readonly baseUnits: string;
    readonly feeBaseUnits: string;
    readonly balanceBaseUnits: string;
    /** Fiat value of the amount if a rate is available. */
    readonly fiat?: number;
  };
  readonly profile: ProfileId;
  readonly backupConfirmed: boolean;
  readonly knownAddresses: readonly KnownAddress[];
  /** User finished the address-review challenge for exactly this address. */
  readonly addressReviewed: boolean;
  /** Warning ids the user has acknowledged. */
  readonly acknowledged: readonly string[];
}

/** Checklist item ids. */
export type ItemId =
  | 'input_invalid'
  | 'address_invalid'
  | 'network_mismatch'
  | 'amount_invalid'
  | 'insufficient_funds'
  | 'backup_not_confirmed'
  | 'address_review_required'
  | 'first_time_recipient'
  | 'lookalike_address'
  | 'address_changed'
  | 'untrusted_source'
  | 'high_value'
  | 'high_fee'
  | 'self_send';

/** One evaluated checklist item. */
export interface ChecklistItem {
  readonly id: ItemId;
  readonly kind: 'blocker' | 'warning';
  /** True when the check is satisfied (nothing to show beyond a tick). */
  readonly passed: boolean;
  /** Warnings only: user acknowledged a failing warning. */
  readonly acknowledged: boolean;
  readonly messageKey: string;
  /** Plain interpolation params (labels from known addresses are data, not markup). */
  readonly params: Readonly<Record<string, string | number>>;
}

/** Evaluation result. */
export interface ChecklistResult {
  readonly canSend: boolean;
  readonly items: readonly ChecklistItem[];
  /** Failing blockers. */
  readonly blockers: readonly ChecklistItem[];
  /** Failing warnings not yet acknowledged. */
  readonly pendingWarnings: readonly ChecklistItem[];
  /** Whether the address-review challenge should be shown. */
  readonly reviewNeeded: boolean;
}

const DIGITS = /^(0|[1-9][0-9]{0,77})$/;
const ASCII_PRINTABLE = /^[\x21-\x7e]{1,128}$/;

/** Normalize an address for comparison: hex (0x) addresses are case-insensitive. */
export function normalizeAddress(a: string): string {
  return /^0x[0-9a-fA-F]+$/.test(a) ? a.toLowerCase() : a;
}

/** True for a plausible, spoof-free address string (ASCII printable, no spaces). */
export function isCleanAddress(a: unknown): a is string {
  return typeof a === 'string' && ASCII_PRINTABLE.test(a);
}

/**
 * Detect a look-alike (address-poisoning) address: same first and last
 * `edge` characters as a known address but not equal to it.
 */
export function findLookalike(
  address: string,
  known: readonly KnownAddress[],
  edge = 4,
): KnownAddress | null {
  const n = normalizeAddress(address);
  if (n.length < edge * 2 + 1) return null;
  for (const k of known) {
    const kn = normalizeAddress(k.address);
    if (kn === n || kn.length < edge * 2 + 1) continue;
    if (kn.slice(0, edge) === n.slice(0, edge) && kn.slice(-edge) === n.slice(-edge)) return k;
  }
  return null;
}

function reviewRequired(mode: AddressReviewMode, r: SendCheckInput['recipient']): boolean {
  switch (mode) {
    case 'always':
      return true;
    case 'non_contacts':
      return !r.inContacts;
    case 'new_recipients':
      return !r.inContacts && !r.previouslyPaid;
  }
}

function validInput(i: unknown): i is SendCheckInput {
  if (typeof i !== 'object' || i === null) return false;
  const x = i as Record<string, unknown>;
  const r = x['recipient'] as Record<string, unknown> | undefined;
  const w = x['wallet'] as Record<string, unknown> | undefined;
  const a = x['amount'] as Record<string, unknown> | undefined;
  if (!r || !w || !a || typeof r !== 'object' || typeof w !== 'object' || typeof a !== 'object') return false;
  if (
    typeof r['address'] !== 'string' ||
    typeof r['network'] !== 'string' ||
    typeof w['network'] !== 'string'
  )
    return false;
  if (typeof r['source'] !== 'string' || !SOURCES.includes(r['source'])) return false;
  for (const k of ['valid', 'inContacts', 'previouslyPaid', 'changedSinceEntry'])
    if (typeof r[k] !== 'boolean') return false;
  const strArr = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!strArr(w['ownAddresses']) || !strArr(x['acknowledged'])) return false;
  for (const k of ['baseUnits', 'feeBaseUnits', 'balanceBaseUnits'])
    if (typeof a[k] !== 'string') return false;
  if (
    a['fiat'] !== undefined &&
    (typeof a['fiat'] !== 'number' || !Number.isFinite(a['fiat']) || a['fiat'] < 0)
  )
    return false;
  if (!isProfileId(x['profile'])) return false;
  if (typeof x['backupConfirmed'] !== 'boolean' || typeof x['addressReviewed'] !== 'boolean') return false;
  const ka = x['knownAddresses'];
  if (!Array.isArray(ka)) return false;
  return ka.every((k: unknown) => {
    const o = k as Record<string, unknown> | null;
    return (
      typeof o === 'object' &&
      o !== null &&
      typeof o['address'] === 'string' &&
      typeof o['label'] === 'string'
    );
  });
}

const failClosed = (): ChecklistResult => {
  const item: ChecklistItem = {
    id: 'input_invalid',
    kind: 'blocker',
    passed: false,
    acknowledged: false,
    messageKey: 'guide.checklist.input_invalid',
    params: {},
  };
  return { canSend: false, items: [item], blockers: [item], pendingWarnings: [], reviewNeeded: false };
};

/**
 * Evaluate the pre-send checklist.
 * @security Fail-closed on malformed input. A warning counts as satisfied only
 * if its id is in `acknowledged`; blockers can never be acknowledged away.
 */
export function evaluateChecklist(input: unknown): ChecklistResult {
  if (!validInput(input)) return failClosed();
  const { recipient: r, wallet, amount, profile } = input;
  const settings = settingsFor(profile);
  const items: ChecklistItem[] = [];
  const blocker = (id: ItemId, passed: boolean, params: ChecklistItem['params'] = {}): void => {
    items.push({
      id,
      kind: 'blocker',
      passed,
      acknowledged: false,
      messageKey: `guide.checklist.${id}`,
      params,
    });
  };
  const warning = (id: ItemId, passed: boolean, params: ChecklistItem['params'] = {}): void => {
    items.push({
      id,
      kind: 'warning',
      passed,
      acknowledged: !passed && input.acknowledged.includes(id),
      messageKey: `guide.checklist.${id}`,
      params,
    });
  };

  blocker('address_invalid', r.valid && isCleanAddress(r.address));
  blocker('network_mismatch', r.network === wallet.network, {
    expected: wallet.network,
    actual: r.network.slice(0, 32),
  });

  const { baseUnits, feeBaseUnits, balanceBaseUnits } = amount;
  const numsOk = DIGITS.test(baseUnits) && DIGITS.test(feeBaseUnits) && DIGITS.test(balanceBaseUnits);
  blocker('amount_invalid', numsOk && BigInt(baseUnits) > 0n);
  if (numsOk) {
    const amt = BigInt(baseUnits);
    const fee = BigInt(feeBaseUnits);
    blocker('insufficient_funds', amt + fee <= BigInt(balanceBaseUnits));
    warning('high_fee', amt === 0n || fee * 10n <= amt);
  } else {
    blocker('insufficient_funds', false);
    warning('high_fee', true);
  }
  blocker('backup_not_confirmed', input.backupConfirmed);

  const needsReview = reviewRequired(settings.addressReview, r);
  blocker('address_review_required', !needsReview || input.addressReviewed);

  const norm = normalizeAddress(r.address);
  const look = findLookalike(r.address, input.knownAddresses);
  warning('first_time_recipient', r.inContacts || r.previouslyPaid);
  warning('lookalike_address', look === null, look ? { label: look.label.slice(0, 64) } : {});
  warning('address_changed', !r.changedSinceEntry);
  warning('untrusted_source', r.source !== 'link' || r.inContacts);
  warning('self_send', !wallet.ownAddresses.some((a) => normalizeAddress(a) === norm));
  const fiat = amount.fiat;
  warning('high_value', fiat === undefined || fiat < settings.highValueFiatThreshold, {
    threshold: settings.highValueFiatThreshold,
  });

  const blockers = items.filter((i) => i.kind === 'blocker' && !i.passed);
  const pendingWarnings = items.filter((i) => i.kind === 'warning' && !i.passed && !i.acknowledged);
  return {
    canSend: blockers.length === 0 && pendingWarnings.length === 0,
    items,
    blockers,
    pendingWarnings,
    reviewNeeded: needsReview && !input.addressReviewed,
  };
}

/** Address-review prompt data. */
export interface AddressReview {
  /** Address split into groups for display. */
  readonly chunks: readonly string[];
  /** Characters at each end the user should compare against the source. */
  readonly edge: number;
  /** Index of the chunk the user must retype. */
  readonly challengeIndex: number;
  /** i18n keys for the prompts to show. */
  readonly promptKeys: readonly string[];
}

/** Chunk size used for display. */
export const CHUNK_SIZE = 4;

/**
 * Build the address-review prompt. The user must retype one randomly chosen
 * chunk (forces reading the middle of the address, not just its ends).
 * @param pick injected RNG: integer in [0, n).
 * @security Rejects unclean addresses so invisible characters cannot hide in chunks.
 */
export function buildAddressReview(address: string, pick: (n: number) => number): AddressReview {
  if (!isCleanAddress(address)) throw new RangeError('unclean address');
  const chunks: string[] = [];
  for (let i = 0; i < address.length; i += CHUNK_SIZE) chunks.push(address.slice(i, i + CHUNK_SIZE));
  const idx = pick(chunks.length);
  if (!Number.isInteger(idx) || idx < 0 || idx >= chunks.length) throw new RangeError('pick out of range');
  return {
    chunks,
    edge: Math.min(6, Math.floor(address.length / 2)),
    challengeIndex: idx,
    promptKeys: ['guide.review.compareEnds', 'guide.review.compareMiddle', 'guide.review.retypeChunk'],
  };
}

/**
 * Grade the retyped chunk. Hex (0x) addresses compare case-insensitively;
 * all other formats are case-sensitive.
 */
export function gradeAddressReview(address: string, review: AddressReview, typed: string): boolean {
  if (!isCleanAddress(address)) return false;
  const expected = review.chunks[review.challengeIndex];
  if (expected === undefined || review.chunks.join('') !== address) return false;
  const t = typed.trim();
  return /^0x[0-9a-fA-F]+$/.test(address) ? t.toLowerCase() === expected.toLowerCase() : t === expected;
}
