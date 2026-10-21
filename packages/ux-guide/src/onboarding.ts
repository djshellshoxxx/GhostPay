/**
 * Onboarding flow as a pure state machine plus view-model.
 *
 * Steps: welcome, wallet (create/import), backup (quiz), profile, receive.
 * The state is resumable (JSON-safe, strictly re-validated on load).
 *
 * @security The state and events NEVER contain secrets: no mnemonic words,
 * keys, passwords, or addresses. Quiz grading yields booleans only (see
 * {@link gradeQuiz}); the host keeps the secret in its vault. Loading
 * persisted state rejects any unknown key and any string outside fixed enums,
 * so a tampered or secret-bearing blob cannot be resumed.
 */

import { isProfileId, type ProfileId } from './profiles.js';

/** Steps in order. `done` is terminal. */
export type OnboardingStep = 'welcome' | 'wallet' | 'backup' | 'profile' | 'receive' | 'done';
/** Visible (progress) steps. */
export const VISIBLE_STEPS = ['welcome', 'wallet', 'backup', 'profile', 'receive'] as const;
/** Wallet origin. */
export type WalletMode = 'create' | 'import';
/** Number of words quizzed. */
export const QUIZ_SIZE = 3;
/** Wrong submissions before the phrase must be re-viewed. */
export const MAX_QUIZ_ATTEMPTS = 3;

/** Serializable onboarding state. */
export interface OnboardingState {
  readonly version: 1;
  readonly step: OnboardingStep;
  readonly walletMode: WalletMode | null;
  /** Host has persisted the wallet in its vault. */
  readonly walletReady: boolean;
  /** 12 or 24 once a created wallet is ready; else null. */
  readonly wordCount: 12 | 24 | null;
  /** 1-based quiz positions, ascending, or empty when no quiz is active. */
  readonly quizPositions: readonly number[];
  readonly quizAttempts: number;
  /** Too many wrong answers: user must view the phrase again. */
  readonly reviewRequired: boolean;
  readonly backupConfirmed: boolean;
  readonly profile: ProfileId | null;
  readonly receiveAcknowledged: boolean;
  readonly startedAt: number;
  readonly updatedAt: number;
}

/** Events accepted by {@link reduce}. `at` is an injected epoch-ms timestamp. */
export type OnboardingEvent =
  | { readonly type: 'START'; readonly at: number }
  | { readonly type: 'CHOOSE_WALLET_MODE'; readonly mode: WalletMode; readonly at: number }
  | { readonly type: 'WALLET_READY'; readonly wordCount?: 12 | 24; readonly at: number }
  | { readonly type: 'QUIZ_POSITIONS'; readonly positions: readonly number[]; readonly at: number }
  | { readonly type: 'QUIZ_SUBMITTED'; readonly correct: readonly boolean[]; readonly at: number }
  | { readonly type: 'PHRASE_REVIEWED'; readonly at: number }
  | { readonly type: 'PROFILE_CHOSEN'; readonly profile: ProfileId; readonly at: number }
  | { readonly type: 'RECEIVE_ACKNOWLEDGED'; readonly at: number }
  | { readonly type: 'BACK'; readonly at: number };

/** Reducer error codes. */
export type OnboardingError =
  | 'invalid_event'
  | 'wrong_step'
  | 'mode_required'
  | 'wallet_not_ready'
  | 'bad_word_count'
  | 'bad_positions'
  | 'bad_quiz_result'
  | 'review_required'
  | 'cannot_go_back';

/** Reducer result: never throws; on error the state is returned unchanged. */
export type ReduceResult =
  | { readonly ok: true; readonly state: OnboardingState }
  | { readonly ok: false; readonly error: OnboardingError; readonly state: OnboardingState };

/** New state at the welcome step. */
export function initialState(now: number): OnboardingState {
  return {
    version: 1,
    step: 'welcome',
    walletMode: null,
    walletReady: false,
    wordCount: null,
    quizPositions: [],
    quizAttempts: 0,
    reviewRequired: false,
    backupConfirmed: false,
    profile: null,
    receiveAcknowledged: false,
    startedAt: now,
    updatedAt: now,
  };
}

const isTs = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** True when `p` is a valid ascending, distinct quiz position list for `wordCount`. */
function validPositions(p: readonly unknown[], wordCount: number): p is number[] {
  if (p.length !== QUIZ_SIZE) return false;
  let prev = 0;
  for (const x of p) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x <= prev || x > wordCount) return false;
    prev = x;
  }
  return true;
}

/**
 * Pick quiz positions (1-based, ascending, distinct) using an injected RNG.
 * @param pick returns an integer in [0, n); the host passes a CSPRNG-backed function.
 * @security Positions are not secret, but must not be predictable by a UI
 * shortcut; use `crypto.getRandomValues` in the host.
 */
export function buildQuiz(wordCount: 12 | 24, pick: (n: number) => number): number[] {
  if (wordCount !== 12 && wordCount !== 24) throw new RangeError('wordCount must be 12 or 24');
  const pool = Array.from({ length: wordCount }, (_, i) => i + 1);
  const chosen: number[] = [];
  for (let i = 0; i < QUIZ_SIZE; i++) {
    const idx = pick(pool.length);
    if (!Number.isInteger(idx) || idx < 0 || idx >= pool.length) throw new RangeError('pick out of range');
    chosen.push(pool.splice(idx, 1)[0] as number);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * Grade quiz answers against the secret phrase, returning booleans only.
 * Comparison trims and lowercases the typed answer.
 * @security `phrase` is secret: pass it from the vault, do not retain it, and
 * feed only the returned booleans to the state machine.
 */
export function gradeQuiz(
  positions: readonly number[],
  answers: readonly string[],
  phrase: readonly string[],
): boolean[] {
  if (answers.length !== positions.length) throw new RangeError('answer count mismatch');
  return positions.map((pos, i) => {
    const expected = phrase[pos - 1];
    const typed = answers[i];
    return expected !== undefined && typed !== undefined && typed.trim().toLowerCase() === expected.toLowerCase();
  });
}

function ok(state: OnboardingState, patch: Partial<OnboardingState>, at: number): ReduceResult {
  return { ok: true, state: { ...state, ...patch, updatedAt: Math.max(at, state.updatedAt) } };
}
function fail(state: OnboardingState, error: OnboardingError): ReduceResult {
  return { ok: false, error, state };
}

/**
 * Pure transition function.
 * @security Never throws and never accepts free-form strings into state.
 */
export function reduce(state: OnboardingState, event: OnboardingEvent): ReduceResult {
  const e = event as { type?: unknown; at?: unknown };
  if (typeof e !== 'object' || e === null || !isTs(e.at)) return fail(state, 'invalid_event');
  const at = e.at;
  switch (event.type) {
    case 'START':
      if (state.step !== 'welcome') return fail(state, 'wrong_step');
      return ok(state, { step: 'wallet' }, at);
    case 'CHOOSE_WALLET_MODE':
      if (state.step !== 'wallet' || state.walletReady) return fail(state, 'wrong_step');
      if (event.mode !== 'create' && event.mode !== 'import') return fail(state, 'invalid_event');
      return ok(state, { walletMode: event.mode }, at);
    case 'WALLET_READY': {
      if (state.step !== 'wallet') return fail(state, 'wrong_step');
      if (state.walletMode === null) return fail(state, 'mode_required');
      if (state.walletMode === 'create') {
        if (event.wordCount !== 12 && event.wordCount !== 24) return fail(state, 'bad_word_count');
        return ok(state, { walletReady: true, wordCount: event.wordCount, step: 'backup' }, at);
      }
      // Imported wallets already have a backup by definition: skip the quiz.
      return ok(state, { walletReady: true, backupConfirmed: true, step: 'profile' }, at);
    }
    case 'QUIZ_POSITIONS':
      if (state.step !== 'backup') return fail(state, 'wrong_step');
      if (state.reviewRequired) return fail(state, 'review_required');
      if (state.wordCount === null || !Array.isArray(event.positions) || !validPositions(event.positions, state.wordCount)) {
        return fail(state, 'bad_positions');
      }
      return ok(state, { quizPositions: [...event.positions] }, at);
    case 'QUIZ_SUBMITTED': {
      if (state.step !== 'backup') return fail(state, 'wrong_step');
      if (state.reviewRequired) return fail(state, 'review_required');
      if (state.quizPositions.length === 0) return fail(state, 'bad_positions');
      const c = event.correct;
      if (!Array.isArray(c) || c.length !== state.quizPositions.length || c.some((b) => typeof b !== 'boolean')) {
        return fail(state, 'bad_quiz_result');
      }
      if (c.every(Boolean)) {
        return ok(state, { backupConfirmed: true, quizPositions: [], quizAttempts: 0, step: 'profile' }, at);
      }
      const attempts = state.quizAttempts + 1;
      if (attempts >= MAX_QUIZ_ATTEMPTS) {
        return ok(state, { quizAttempts: 0, quizPositions: [], reviewRequired: true }, at);
      }
      // New positions must be drawn so answers cannot be brute-forced by retrying.
      return ok(state, { quizAttempts: attempts, quizPositions: [] }, at);
    }
    case 'PHRASE_REVIEWED':
      if (state.step !== 'backup') return fail(state, 'wrong_step');
      return ok(state, { reviewRequired: false, quizPositions: [], quizAttempts: 0 }, at);
    case 'PROFILE_CHOSEN':
      if (state.step !== 'profile') return fail(state, 'wrong_step');
      if (!state.walletReady) return fail(state, 'wallet_not_ready');
      if (!isProfileId(event.profile)) return fail(state, 'invalid_event');
      return ok(state, { profile: event.profile, step: 'receive' }, at);
    case 'RECEIVE_ACKNOWLEDGED':
      if (state.step !== 'receive') return fail(state, 'wrong_step');
      return ok(state, { receiveAcknowledged: true, step: 'done' }, at);
    case 'BACK':
      if (state.step === 'wallet' && !state.walletReady) return ok(state, { step: 'welcome', walletMode: null }, at);
      if (state.step === 'receive') return ok(state, { step: 'profile' }, at);
      return fail(state, 'cannot_go_back');
    default:
      return fail(state, 'invalid_event');
  }
}

const KEYS = [
  'version', 'step', 'walletMode', 'walletReady', 'wordCount', 'quizPositions', 'quizAttempts',
  'reviewRequired', 'backupConfirmed', 'profile', 'receiveAcknowledged', 'startedAt', 'updatedAt',
] as const;
const STEPS: readonly string[] = ['welcome', 'wallet', 'backup', 'profile', 'receive', 'done'];

/**
 * Strictly validate a persisted state blob (e.g. parsed JSON) before resuming.
 * Returns the typed state or `null` if anything is off (unknown keys, odd
 * strings, impossible combinations).
 * @security Fail-closed: callers should restart onboarding on `null`. This also
 * guarantees no secret-bearing string can ride along in persisted state.
 */
export function parseState(raw: unknown): OnboardingState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !KEYS.every((k) => Object.prototype.hasOwnProperty.call(o, k))) return null;
  if (o['version'] !== 1) return null;
  if (typeof o['step'] !== 'string' || !STEPS.includes(o['step'])) return null;
  const mode = o['walletMode'];
  if (mode !== null && mode !== 'create' && mode !== 'import') return null;
  const wc = o['wordCount'];
  if (wc !== null && wc !== 12 && wc !== 24) return null;
  if (typeof o['walletReady'] !== 'boolean' || typeof o['reviewRequired'] !== 'boolean') return null;
  if (typeof o['backupConfirmed'] !== 'boolean' || typeof o['receiveAcknowledged'] !== 'boolean') return null;
  const attempts = o['quizAttempts'];
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts >= MAX_QUIZ_ATTEMPTS) return null;
  const profile = o['profile'];
  if (profile !== null && !isProfileId(profile)) return null;
  if (!isTs(o['startedAt']) || !isTs(o['updatedAt']) || o['updatedAt'] < o['startedAt']) return null;
  const qp = o['quizPositions'];
  if (!Array.isArray(qp)) return null;
  if (qp.length > 0 && (wc === null || !validPositions(qp, wc))) return null;
  const step = o['step'] as OnboardingStep;
  const idx = STEPS.indexOf(step);
  // Consistency between step and facts.
  if (idx >= 2 && (!o['walletReady'] || mode === null)) return null;
  if (mode === 'create' && o['walletReady'] && wc === null) return null;
  if (mode !== 'create' && wc !== null) return null;
  if (idx >= 3 && !o['backupConfirmed']) return null;
  if (step !== 'backup' && (qp.length > 0 || o['reviewRequired'] || attempts > 0)) return null;
  if (idx >= 4 && profile === null) return null;
  if (step === 'done' !== (o['receiveAcknowledged'] === true)) return null;
  if (idx < 2 && o['walletReady']) return null;
  return {
    version: 1, step, walletMode: mode, walletReady: o['walletReady'], wordCount: wc,
    quizPositions: [...(qp as number[])], quizAttempts: attempts, reviewRequired: o['reviewRequired'],
    backupConfirmed: o['backupConfirmed'], profile, receiveAcknowledged: o['receiveAcknowledged'],
    startedAt: o['startedAt'], updatedAt: o['updatedAt'],
  };
}

/** Progress entry status. */
export type StepStatus = 'done' | 'current' | 'todo' | 'skipped';

/** What the host must do on (re)entry to the current step. */
export type ResumeAction =
  | 'none'
  | 'restart_wallet_creation'
  | 'draw_quiz_positions'
  | 'show_phrase_again';

/** View-model for rendering. Contains only keys and flags, no secrets. */
export interface OnboardingViewModel {
  readonly step: OnboardingStep;
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly progress: readonly { readonly id: (typeof VISIBLE_STEPS)[number]; readonly status: StepStatus }[];
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly warningKeys: readonly string[];
  readonly canGoBack: boolean;
  readonly primary: { readonly id: string; readonly labelKey: string; readonly enabled: boolean } | null;
  readonly resumeAction: ResumeAction;
  readonly quizPositions: readonly number[];
  readonly quizAttemptsLeft: number;
  /** The phrase may be displayed on this step (create mode, before backup). */
  readonly mayShowPhrase: boolean;
  readonly finished: boolean;
}

/** Derive the view-model from state. Pure. */
export function viewModel(state: OnboardingState): OnboardingViewModel {
  const order = VISIBLE_STEPS.indexOf(state.step as (typeof VISIBLE_STEPS)[number]);
  const cur = state.step === 'done' ? VISIBLE_STEPS.length : order;
  const progress = VISIBLE_STEPS.map((id, i) => {
    let status: StepStatus = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    if (id === 'backup' && state.walletMode === 'import' && state.walletReady) status = 'skipped';
    return { id, status };
  });
  let resumeAction: ResumeAction = 'none';
  let primary: OnboardingViewModel['primary'] = null;
  const warnings: string[] = [];
  switch (state.step) {
    case 'welcome':
      primary = { id: 'start', labelKey: 'guide.onboarding.welcome.cta', enabled: true };
      break;
    case 'wallet':
      warnings.push('guide.onboarding.warn.noRecovery');
      primary = { id: 'continue', labelKey: 'guide.onboarding.wallet.cta', enabled: state.walletMode !== null };
      // A half-made wallet is never persisted, so a resumed session starts it over.
      if (state.walletMode === 'create') resumeAction = 'restart_wallet_creation';
      break;
    case 'backup':
      warnings.push('guide.onboarding.warn.neverShare', 'guide.onboarding.warn.noScreenshot');
      if (state.reviewRequired) resumeAction = 'show_phrase_again';
      else if (state.quizPositions.length === 0) resumeAction = 'draw_quiz_positions';
      primary = {
        id: state.reviewRequired ? 'reviewed' : 'submit_quiz',
        labelKey: state.reviewRequired ? 'guide.onboarding.backup.reviewed' : 'guide.onboarding.backup.submit',
        enabled: state.reviewRequired || state.quizPositions.length > 0,
      };
      break;
    case 'profile':
      primary = { id: 'choose_profile', labelKey: 'guide.onboarding.profile.cta', enabled: true };
      break;
    case 'receive':
      primary = { id: 'finish', labelKey: 'guide.onboarding.receive.cta', enabled: true };
      break;
    case 'done':
      break;
  }
  return {
    step: state.step,
    stepNumber: Math.min(cur + 1, VISIBLE_STEPS.length),
    totalSteps: VISIBLE_STEPS.length,
    progress,
    titleKey: `guide.onboarding.${state.step}.title`,
    bodyKey: `guide.onboarding.${state.step}.body`,
    warningKeys: warnings,
    canGoBack: (state.step === 'wallet' && !state.walletReady) || state.step === 'receive',
    primary,
    resumeAction,
    quizPositions: state.quizPositions,
    quizAttemptsLeft: state.step === 'backup' ? MAX_QUIZ_ATTEMPTS - state.quizAttempts : 0,
    mayShowPhrase: state.step === 'backup' && state.walletMode === 'create',
    finished: state.step === 'done',
  };
}
