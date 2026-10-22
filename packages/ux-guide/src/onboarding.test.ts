import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_QUIZ_ATTEMPTS,
  buildQuiz,
  gradeQuiz,
  initialState,
  parseState,
  reduce,
  viewModel,
  type OnboardingEvent,
  type OnboardingState,
} from './onboarding.js';

function run(s: OnboardingState, ...evs: OnboardingEvent[]): OnboardingState {
  let cur = s;
  for (const e of evs) {
    const r = reduce(cur, e);
    if (!r.ok) throw new Error(`event ${e.type} failed: ${r.error}`);
    cur = r.state;
  }
  return cur;
}
const T = 1_700_000_000_000;
const created = (): OnboardingState =>
  run(
    initialState(T),
    { type: 'START', at: T + 1 },
    { type: 'CHOOSE_WALLET_MODE', mode: 'create', at: T + 2 },
    { type: 'WALLET_READY', wordCount: 12, at: T + 3 },
  );
const err = (s: OnboardingState, e: OnboardingEvent) => {
  const r = reduce(s, e);
  expect(r.ok).toBe(false);
  expect(r.state).toBe(s);
  return r.ok ? null : r.error;
};

describe('happy paths', () => {
  it('create flow reaches done', () => {
    let s = created();
    expect(s.step).toBe('backup');
    s = run(
      s,
      { type: 'QUIZ_POSITIONS', positions: [2, 5, 11], at: T + 4 },
      { type: 'QUIZ_SUBMITTED', correct: [true, true, true], at: T + 5 },
    );
    expect(s.step).toBe('profile');
    expect(s.backupConfirmed).toBe(true);
    s = run(
      s,
      { type: 'PROFILE_CHOSEN', profile: 'private', at: T + 6 },
      { type: 'RECEIVE_ACKNOWLEDGED', at: T + 7 },
    );
    expect(s.step).toBe('done');
    expect(s.updatedAt).toBe(T + 7);
    expect(viewModel(s).finished).toBe(true);
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('import flow skips backup quiz', () => {
    let s = run(
      initialState(T),
      { type: 'START', at: T },
      { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T },
      { type: 'WALLET_READY', at: T },
    );
    expect(s.step).toBe('profile');
    expect(s.wordCount).toBeNull();
    expect(viewModel(s).progress.map((p) => p.status)).toEqual([
      'done',
      'done',
      'skipped',
      'current',
      'todo',
    ]);
    s = run(s, { type: 'PROFILE_CHOSEN', profile: 'maximum', at: T });
    expect(parseState(s)).toEqual(s);
  });
  it('updatedAt never goes backwards', () => {
    const s = run(initialState(T), { type: 'START', at: T - 500 });
    expect(s.updatedAt).toBe(T);
  });
});

describe('quiz', () => {
  it('wrong answers clear positions, count attempts, then force review', () => {
    let s = created();
    for (let i = 1; i < MAX_QUIZ_ATTEMPTS; i++) {
      s = run(
        s,
        { type: 'QUIZ_POSITIONS', positions: [1, 2, 3], at: T },
        { type: 'QUIZ_SUBMITTED', correct: [true, false, true], at: T },
      );
      expect(s.quizAttempts).toBe(i);
      expect(s.quizPositions).toEqual([]);
      expect(s.reviewRequired).toBe(false);
    }
    expect(viewModel(s).quizAttemptsLeft).toBe(1);
    s = run(
      s,
      { type: 'QUIZ_POSITIONS', positions: [1, 2, 3], at: T },
      { type: 'QUIZ_SUBMITTED', correct: [false, false, false], at: T },
    );
    expect(s.reviewRequired).toBe(true);
    expect(s.quizAttempts).toBe(0);
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [1, 2, 3], at: T })).toBe('review_required');
    expect(err(s, { type: 'QUIZ_SUBMITTED', correct: [true, true, true], at: T })).toBe('review_required');
    expect(viewModel(s).resumeAction).toBe('show_phrase_again');
    expect(viewModel(s).primary).toMatchObject({ id: 'reviewed', enabled: true });
    s = run(s, { type: 'PHRASE_REVIEWED', at: T });
    expect(s.reviewRequired).toBe(false);
    expect(viewModel(s).resumeAction).toBe('draw_quiz_positions');
    expect(viewModel(s).primary).toMatchObject({ id: 'submit_quiz', enabled: false });
  });
  it('rejects malformed quiz input', () => {
    const s = created();
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [1, 2], at: T })).toBe('bad_positions');
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [3, 2, 1], at: T })).toBe('bad_positions');
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [1, 2, 13], at: T })).toBe('bad_positions');
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [1, 1.5, 3], at: T })).toBe('bad_positions');
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: [0, 2, 3], at: T })).toBe('bad_positions');
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: ['1', 2, 3] as unknown as number[], at: T })).toBe(
      'bad_positions',
    );
    expect(err(s, { type: 'QUIZ_POSITIONS', positions: 'abc' as unknown as number[], at: T })).toBe(
      'bad_positions',
    );
    expect(err(s, { type: 'QUIZ_SUBMITTED', correct: [true, true, true], at: T })).toBe('bad_positions');
    const q = run(s, { type: 'QUIZ_POSITIONS', positions: [1, 2, 3], at: T });
    expect(err(q, { type: 'QUIZ_SUBMITTED', correct: [true, true], at: T })).toBe('bad_quiz_result');
    expect(
      err(q, { type: 'QUIZ_SUBMITTED', correct: ['yes', true, true] as unknown as boolean[], at: T }),
    ).toBe('bad_quiz_result');
    expect(err(q, { type: 'QUIZ_SUBMITTED', correct: null as unknown as boolean[], at: T })).toBe(
      'bad_quiz_result',
    );
  });
  it('buildQuiz picks distinct sorted positions', () => {
    expect(buildQuiz(12, () => 0)).toEqual([1, 2, 3]);
    expect(buildQuiz(24, (n) => n - 1)).toEqual([22, 23, 24]);
    expect(() => buildQuiz(13 as 12, () => 0)).toThrow(RangeError);
    expect(() => buildQuiz(12, () => 99)).toThrow(RangeError);
    expect(() => buildQuiz(12, () => 0.5)).toThrow(RangeError);
    fc.assert(
      fc.property(fc.constantFrom<12 | 24>(12, 24), fc.infiniteStream(fc.nat()), (wc, st) => {
        const it = st[Symbol.iterator]();
        const q = buildQuiz(wc, (n) => (it.next().value as number) % n);
        expect(new Set(q).size).toBe(3);
        expect([...q].sort((a, b) => a - b)).toEqual(q);
        expect(Math.max(...q)).toBeLessThanOrEqual(wc);
        expect(Math.min(...q)).toBeGreaterThanOrEqual(1);
      }),
    );
  });
  it('gradeQuiz uses fake words and returns booleans only', () => {
    const phrase = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
    expect(gradeQuiz([1, 3, 6], [' Alpha ', 'charly', 'FOXTROT'], phrase)).toEqual([true, false, true]);
    expect(gradeQuiz([9], ['x'], phrase)).toEqual([false]);
    expect(() => gradeQuiz([1, 2], ['a'], phrase)).toThrow(RangeError);
  });
});

describe('transition guards', () => {
  it('rejects wrong-step events', () => {
    const w = initialState(T);
    expect(err(w, { type: 'CHOOSE_WALLET_MODE', mode: 'create', at: T })).toBe('wrong_step');
    expect(err(w, { type: 'WALLET_READY', at: T })).toBe('wrong_step');
    expect(err(w, { type: 'QUIZ_POSITIONS', positions: [1, 2, 3], at: T })).toBe('wrong_step');
    expect(err(w, { type: 'QUIZ_SUBMITTED', correct: [], at: T })).toBe('wrong_step');
    expect(err(w, { type: 'PHRASE_REVIEWED', at: T })).toBe('wrong_step');
    expect(err(w, { type: 'PROFILE_CHOSEN', profile: 'private', at: T })).toBe('wrong_step');
    expect(err(w, { type: 'RECEIVE_ACKNOWLEDGED', at: T })).toBe('wrong_step');
    expect(err(w, { type: 'BACK', at: T })).toBe('cannot_go_back');
    const c = created();
    expect(err(c, { type: 'START', at: T })).toBe('wrong_step');
    expect(err(c, { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T })).toBe('wrong_step');
    expect(err(c, { type: 'PROFILE_CHOSEN', profile: 'private', at: T })).toBe('wrong_step');
    expect(err(c, { type: 'BACK', at: T })).toBe('cannot_go_back');
  });
  it('wallet step guards', () => {
    const w = run(initialState(T), { type: 'START', at: T });
    expect(err(w, { type: 'WALLET_READY', at: T })).toBe('mode_required');
    expect(err(w, { type: 'CHOOSE_WALLET_MODE', mode: 'hack' as 'create', at: T })).toBe('invalid_event');
    const c = run(w, { type: 'CHOOSE_WALLET_MODE', mode: 'create', at: T });
    expect(err(c, { type: 'WALLET_READY', at: T })).toBe('bad_word_count');
    expect(err(c, { type: 'WALLET_READY', wordCount: 18 as 12, at: T })).toBe('bad_word_count');
    const sw = run(c, { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T });
    expect(sw.walletMode).toBe('import');
    const back = run(sw, { type: 'BACK', at: T });
    expect(back.step).toBe('welcome');
    expect(back.walletMode).toBeNull();
  });
  it('profile step guards', () => {
    const s = run(
      initialState(T),
      { type: 'START', at: T },
      { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T },
      { type: 'WALLET_READY', at: T },
    );
    expect(err(s, { type: 'PROFILE_CHOSEN', profile: 'nope' as 'private', at: T })).toBe('invalid_event');
    expect(err(s, { type: 'BACK', at: T })).toBe('cannot_go_back');
    const bad: OnboardingState = { ...s, walletReady: false };
    expect(err(bad, { type: 'PROFILE_CHOSEN', profile: 'private', at: T })).toBe('wallet_not_ready');
  });
  it('back from receive returns to profile', () => {
    let s = run(
      initialState(T),
      { type: 'START', at: T },
      { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T },
      { type: 'WALLET_READY', at: T },
      { type: 'PROFILE_CHOSEN', profile: 'everyday', at: T },
    );
    expect(viewModel(s).canGoBack).toBe(true);
    s = run(s, { type: 'BACK', at: T });
    expect(s.step).toBe('profile');
    expect(s.profile).toBe('everyday');
  });
  it('rejects bad timestamps and unknown events', () => {
    const s = initialState(T);
    for (const at of [-1, 1.5, NaN, '1' as unknown as number, undefined as unknown as number]) {
      expect(err(s, { type: 'START', at })).toBe('invalid_event');
    }
    expect(err(s, null as unknown as OnboardingEvent)).toBe('invalid_event');
    expect(err(s, { type: 'EXPLODE', at: T } as unknown as OnboardingEvent)).toBe('invalid_event');
  });
  it('property: random event streams never throw and never leave valid states', () => {
    const evArb: fc.Arbitrary<OnboardingEvent> = fc.oneof(
      fc.constant<OnboardingEvent>({ type: 'START', at: T }),
      fc
        .constantFrom<'create' | 'import'>('create', 'import')
        .map((mode): OnboardingEvent => ({ type: 'CHOOSE_WALLET_MODE', mode, at: T })),
      fc
        .constantFrom<12 | 24 | undefined>(12, 24, undefined)
        .map(
          (w) =>
            (w
              ? { type: 'WALLET_READY', wordCount: w, at: T }
              : { type: 'WALLET_READY', at: T }) as OnboardingEvent,
        ),
      fc.constant<OnboardingEvent>({ type: 'QUIZ_POSITIONS', positions: [1, 4, 9], at: T }),
      fc
        .array(fc.boolean(), { maxLength: 4 })
        .map((correct): OnboardingEvent => ({ type: 'QUIZ_SUBMITTED', correct, at: T })),
      fc.constant<OnboardingEvent>({ type: 'PHRASE_REVIEWED', at: T }),
      fc
        .constantFrom('everyday', 'private', 'maximum')
        .map((profile): OnboardingEvent => ({ type: 'PROFILE_CHOSEN', profile, at: T })),
      fc.constant<OnboardingEvent>({ type: 'RECEIVE_ACKNOWLEDGED', at: T }),
      fc.constant<OnboardingEvent>({ type: 'BACK', at: T }),
    );
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 40 }), (evs) => {
        let s = initialState(T);
        for (const e of evs) {
          s = reduce(s, e).state;
          expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
          // cannot be past backup without confirmed backup
          if (['profile', 'receive', 'done'].includes(s.step)) expect(s.backupConfirmed).toBe(true);
        }
      }),
    );
  });
});

describe('viewModel', () => {
  it('welcome and wallet steps', () => {
    const w = viewModel(initialState(T));
    expect(w).toMatchObject({
      stepNumber: 1,
      totalSteps: 5,
      titleKey: 'guide.onboarding.welcome.title',
      canGoBack: false,
      resumeAction: 'none',
    });
    const s1 = run(initialState(T), { type: 'START', at: T });
    expect(viewModel(s1).primary?.enabled).toBe(false);
    expect(viewModel(s1).canGoBack).toBe(true);
    const s2 = run(s1, { type: 'CHOOSE_WALLET_MODE', mode: 'create', at: T });
    expect(viewModel(s2).primary?.enabled).toBe(true);
    expect(viewModel(s2).resumeAction).toBe('restart_wallet_creation');
    expect(viewModel(s2).warningKeys).toEqual(['guide.onboarding.warn.noRecovery']);
  });
  it('backup step may show phrase, warns, exposes quiz', () => {
    const s = run(created(), { type: 'QUIZ_POSITIONS', positions: [2, 5, 11], at: T });
    const v = viewModel(s);
    expect(v).toMatchObject({
      mayShowPhrase: true,
      quizPositions: [2, 5, 11],
      quizAttemptsLeft: 3,
      stepNumber: 3,
      resumeAction: 'none',
    });
    expect(v.warningKeys).toContain('guide.onboarding.warn.neverShare');
    expect(v.primary).toMatchObject({ id: 'submit_quiz', enabled: true });
  });
  it('receive and profile steps', () => {
    const p = run(
      initialState(T),
      { type: 'START', at: T },
      { type: 'CHOOSE_WALLET_MODE', mode: 'import', at: T },
      { type: 'WALLET_READY', at: T },
    );
    expect(viewModel(p).primary?.id).toBe('choose_profile');
    expect(viewModel(p).mayShowPhrase).toBe(false);
    const r = run(p, { type: 'PROFILE_CHOSEN', profile: 'private', at: T });
    expect(viewModel(r).primary?.id).toBe('finish');
    expect(viewModel(r).stepNumber).toBe(5);
    const d = run(r, { type: 'RECEIVE_ACKNOWLEDGED', at: T });
    expect(viewModel(d)).toMatchObject({ primary: null, stepNumber: 5, finished: true });
    expect(viewModel(d).progress.map((x) => x.status)).toEqual(['done', 'done', 'skipped', 'done', 'done']);
  });
});

describe('parseState (untrusted persisted data)', () => {
  const good = created();
  const mutate = (patch: Record<string, unknown>) => parseState({ ...good, ...patch });
  it('accepts valid states', () => {
    expect(parseState(good)).toEqual(good);
    expect(parseState(initialState(T))).toEqual(initialState(T));
    const q = run(good, { type: 'QUIZ_POSITIONS', positions: [2, 5, 11], at: T });
    expect(parseState(q)).toEqual(q);
  });
  it('rejects non-objects, extra keys, missing keys', () => {
    expect(parseState(null)).toBeNull();
    expect(parseState([])).toBeNull();
    expect(parseState('x')).toBeNull();
    expect(parseState({ ...good, mnemonic: 'alpha bravo' })).toBeNull();
    const rest: Record<string, unknown> = { ...good };
    delete rest['step'];
    expect(parseState({ ...rest, extra: 1 })).toBeNull();
    expect(parseState(rest)).toBeNull();
  });
  it('rejects secret-like strings in enum fields', () => {
    expect(mutate({ step: 'alpha bravo charlie' })).toBeNull();
    expect(mutate({ walletMode: 'alpha' })).toBeNull();
    expect(mutate({ profile: 'alpha' })).toBeNull();
    expect(mutate({ step: 5 })).toBeNull();
    expect(mutate({ quizPositions: ['alpha', 'bravo', 'charlie'] })).toBeNull();
  });
  it('rejects bad scalars', () => {
    expect(mutate({ version: 2 })).toBeNull();
    expect(mutate({ wordCount: 13 })).toBeNull();
    expect(mutate({ walletReady: 'yes' })).toBeNull();
    expect(mutate({ reviewRequired: 1 })).toBeNull();
    expect(mutate({ backupConfirmed: 1 })).toBeNull();
    expect(mutate({ receiveAcknowledged: 1 })).toBeNull();
    expect(mutate({ quizAttempts: 3 })).toBeNull();
    expect(mutate({ quizAttempts: -1 })).toBeNull();
    expect(mutate({ quizAttempts: 1.5 })).toBeNull();
    expect(mutate({ quizAttempts: '1' })).toBeNull();
    expect(mutate({ startedAt: -1 })).toBeNull();
    expect(mutate({ updatedAt: T - 5 })).toBeNull();
    expect(mutate({ quizPositions: 'abc' })).toBeNull();
    expect(mutate({ quizPositions: [1, 2] })).toBeNull();
    expect(mutate({ quizPositions: [1, 2, 99] })).toBeNull();
  });
  it('rejects inconsistent combinations', () => {
    expect(mutate({ step: 'profile' })).toBeNull(); // backup not confirmed
    expect(mutate({ walletReady: false })).toBeNull(); // backup needs wallet
    expect(mutate({ walletMode: null })).toBeNull();
    expect(mutate({ wordCount: null })).toBeNull(); // create + ready needs wordCount
    expect(mutate({ walletMode: 'import' })).toBeNull(); // import has no wordCount
    expect(mutate({ step: 'wallet', walletReady: true, wordCount: null })).toBeNull();
    expect(mutate({ step: 'receive', backupConfirmed: true, profile: null })).toBeNull();
    expect(mutate({ step: 'done', backupConfirmed: true, profile: 'private' })).toBeNull(); // not acknowledged
    expect(mutate({ receiveAcknowledged: true })).toBeNull(); // acknowledged but not done
    expect(parseState({ ...initialState(T), quizPositions: [1, 2, 3] })).toBeNull(); // positions without wordCount
    expect(parseState({ ...initialState(T), reviewRequired: true })).toBeNull();
    const prof = { ...good, step: 'profile', backupConfirmed: true };
    expect(parseState({ ...prof, quizAttempts: 1 })).toBeNull();
    expect(parseState({ ...prof, reviewRequired: true })).toBeNull();
    expect(parseState({ ...prof, quizPositions: [1, 2, 3] })).toBeNull();
    expect(parseState({ ...prof, profile: 'private' })).not.toBeNull();
  });
  it('fuzz: arbitrary JSON never throws', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        parseState(v);
      }),
    );
  });
});
