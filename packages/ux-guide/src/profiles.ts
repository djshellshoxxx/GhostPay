/**
 * Privacy-profile selector logic: profile definitions, tradeoffs table,
 * recommendation from questionnaire answers, and the effect of a profile on
 * settings expressed as plain data.
 *
 * @security Pure functions only. No network, no storage, no clock. Settings
 * are plain data; the host decides how to persist them. Answers are untrusted
 * and strictly validated.
 */

/** Identifier of a privacy profile. */
export type ProfileId = 'everyday' | 'private' | 'maximum';

/** Profiles ordered from least to most private. */
export const PROFILE_IDS: readonly ProfileId[] = ['everyday', 'private', 'maximum'] as const;

/** How the receive address is derived. */
export type ReceiveAddressMode = 'reuse' | 'fresh_per_receive' | 'fresh_per_payer';
/** When the fiat-rate feed may be contacted (host-enforced). */
export type FiatRateMode = 'on_demand' | 'cached_only' | 'off';
/** When the address-review challenge is required before sending. */
export type AddressReviewMode = 'new_recipients' | 'non_contacts' | 'always';

/** Settings a profile controls. Plain data, JSON-safe. */
export interface ProfileSettings {
  readonly receiveAddressMode: ReceiveAddressMode;
  /** Maximum random delay (minutes) before broadcasting a send. */
  readonly sendDelayMaxMinutes: number;
  readonly fiatRateMode: FiatRateMode;
  readonly hideBalanceByDefault: boolean;
  readonly addressReview: AddressReviewMode;
  /** Confirmations before funds count as spendable. */
  readonly confirmationsRequired: number;
  /** Fiat amount at or above which a send is flagged high-value. */
  readonly highValueFiatThreshold: number;
  readonly autoLockMinutes: number;
}

/** Keys of {@link ProfileSettings}. */
export type SettingKey = keyof ProfileSettings;

const SETTINGS: Readonly<Record<ProfileId, ProfileSettings>> = {
  everyday: {
    receiveAddressMode: 'reuse',
    sendDelayMaxMinutes: 0,
    fiatRateMode: 'on_demand',
    hideBalanceByDefault: false,
    addressReview: 'new_recipients',
    confirmationsRequired: 1,
    highValueFiatThreshold: 1000,
    autoLockMinutes: 15,
  },
  private: {
    receiveAddressMode: 'fresh_per_receive',
    sendDelayMaxMinutes: 10,
    fiatRateMode: 'cached_only',
    hideBalanceByDefault: true,
    addressReview: 'non_contacts',
    confirmationsRequired: 2,
    highValueFiatThreshold: 500,
    autoLockMinutes: 5,
  },
  maximum: {
    receiveAddressMode: 'fresh_per_payer',
    sendDelayMaxMinutes: 60,
    fiatRateMode: 'off',
    hideBalanceByDefault: true,
    addressReview: 'always',
    confirmationsRequired: 6,
    highValueFiatThreshold: 100,
    autoLockMinutes: 1,
  },
};

/** Type guard for {@link ProfileId}. */
export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === 'string' && (PROFILE_IDS as readonly string[]).includes(v);
}

/**
 * Settings for a profile (fresh copy; mutation never affects the table).
 * @security Throws on unknown ids so a corrupted id can never select defaults silently.
 */
export function settingsFor(profile: ProfileId): ProfileSettings {
  if (!isProfileId(profile)) throw new RangeError('unknown profile');
  return { ...SETTINGS[profile] };
}

/** One changed setting between two settings objects. */
export interface SettingChange {
  readonly key: SettingKey;
  readonly from: ProfileSettings[SettingKey];
  readonly to: ProfileSettings[SettingKey];
}

/** Settings that differ between `from` and `to`, in stable key order. */
export function diffSettings(from: ProfileSettings, to: ProfileSettings): SettingChange[] {
  const out: SettingChange[] = [];
  for (const key of Object.keys(SETTINGS.everyday) as SettingKey[]) {
    if (from[key] !== to[key]) out.push({ key, from: from[key], to: to[key] });
  }
  return out;
}

/** Profile whose settings equal `settings` exactly, or `custom`. */
export function detectProfile(settings: ProfileSettings): ProfileId | 'custom' {
  for (const id of PROFILE_IDS) {
    if (diffSettings(settings, SETTINGS[id]).length === 0) return id;
  }
  return 'custom';
}

/** Rating 1 (worst) to 3 (best) for a tradeoff dimension. */
export type Level = 1 | 2 | 3;

/** One row of the tradeoffs table. */
export interface TradeoffRow {
  readonly id: 'privacy' | 'speed' | 'convenience' | 'fees';
  /** i18n key for the row label. */
  readonly labelKey: string;
  readonly cells: Readonly<Record<ProfileId, { readonly level: Level; readonly noteKey: string }>>;
}

const cell = (row: string, p: ProfileId, level: Level) => ({
  level,
  noteKey: `guide.profile.tradeoff.${row}.${p}`,
});

/** Tradeoffs table. Higher level is always better for the user on that axis. */
export const TRADEOFFS: readonly TradeoffRow[] = [
  {
    id: 'privacy',
    labelKey: 'guide.profile.tradeoff.privacy.label',
    cells: {
      everyday: cell('privacy', 'everyday', 1),
      private: cell('privacy', 'private', 2),
      maximum: cell('privacy', 'maximum', 3),
    },
  },
  {
    id: 'speed',
    labelKey: 'guide.profile.tradeoff.speed.label',
    cells: {
      everyday: cell('speed', 'everyday', 3),
      private: cell('speed', 'private', 2),
      maximum: cell('speed', 'maximum', 1),
    },
  },
  {
    id: 'convenience',
    labelKey: 'guide.profile.tradeoff.convenience.label',
    cells: {
      everyday: cell('convenience', 'everyday', 3),
      private: cell('convenience', 'private', 2),
      maximum: cell('convenience', 'maximum', 1),
    },
  },
  {
    id: 'fees',
    labelKey: 'guide.profile.tradeoff.fees.label',
    cells: {
      everyday: cell('fees', 'everyday', 3),
      private: cell('fees', 'private', 2),
      maximum: cell('fees', 'maximum', 2),
    },
  },
];

/** Questionnaire question ids and their allowed option ids. */
export const QUESTIONS = {
  audience: ['casual', 'acquaintances', 'adversary'],
  amounts: ['small', 'moderate', 'large'],
  waiting: ['instant', 'minutes', 'hours'],
} as const;

/** Question id. */
export type QuestionId = keyof typeof QUESTIONS;

/** Possibly partial answers: question id to option id. */
export type Answers = Partial<{ [Q in QuestionId]: (typeof QUESTIONS)[Q][number] }>;

type Scores = Record<ProfileId, number>;

const SCORING: { [Q in QuestionId]: Record<string, Scores> } = {
  audience: {
    casual: { everyday: 3, private: 1, maximum: 0 },
    acquaintances: { everyday: 0, private: 3, maximum: 1 },
    adversary: { everyday: 0, private: 1, maximum: 4 },
  },
  amounts: {
    small: { everyday: 2, private: 1, maximum: 0 },
    moderate: { everyday: 0, private: 2, maximum: 1 },
    large: { everyday: 0, private: 1, maximum: 2 },
  },
  waiting: {
    instant: { everyday: 3, private: 1, maximum: 0 },
    minutes: { everyday: 0, private: 2, maximum: 1 },
    hours: { everyday: 0, private: 1, maximum: 3 },
  },
};

/** Result of {@link recommendProfile}. */
export interface Recommendation {
  readonly profile: ProfileId;
  readonly scores: Readonly<Scores>;
  /** All three questions answered. */
  readonly complete: boolean;
  /** i18n keys explaining the recommendation. */
  readonly reasonKeys: readonly string[];
}

/** Error thrown for invalid answers. */
export class AnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnswerError';
  }
}

/**
 * Recommend a profile from questionnaire answers.
 *
 * Ties break toward the more private profile, except that a user who needs
 * instant sends is never recommended `maximum` (it adds up to an hour of delay).
 * No answers yields `private` as a balanced default.
 *
 * @security Answers are untrusted: unknown questions, unknown options and
 * non-plain-object input throw {@link AnswerError}.
 */
export function recommendProfile(answers: unknown): Recommendation {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    throw new AnswerError('answers must be an object');
  }
  const scores: Scores = { everyday: 0, private: 0, maximum: 0 };
  let count = 0;
  const reasons: string[] = [];
  const rec = answers as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (!Object.prototype.hasOwnProperty.call(QUESTIONS, k))
      throw new AnswerError(`unknown question: ${k.slice(0, 32)}`);
  }
  for (const q of Object.keys(QUESTIONS) as QuestionId[]) {
    const v = rec[q];
    if (v === undefined) continue;
    const table = SCORING[q];
    if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(table, v)) {
      throw new AnswerError(`invalid option for ${q}`);
    }
    const s = table[v] as Scores;
    for (const p of PROFILE_IDS) scores[p] += s[p];
    count++;
    reasons.push(`guide.profile.reason.${q}.${v}`);
  }
  let best: ProfileId = 'private';
  if (count > 0) {
    best = 'everyday';
    for (const p of PROFILE_IDS) if (scores[p] >= scores[best]) best = p;
  }
  if (best === 'maximum' && rec['waiting'] === 'instant') {
    best = 'private';
    reasons.push('guide.profile.reason.cap.instant');
  }
  return { profile: best, scores, complete: count === 3, reasonKeys: reasons };
}
