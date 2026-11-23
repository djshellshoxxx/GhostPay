import { describe, expect, it } from 'vitest';
import {
  MAX_QUIZ_ATTEMPTS,
  initialState,
  reduce,
  type OnboardingEvent,
  type OnboardingState,
} from './onboarding.js';

const T = 1_700_000_000_000;
const positions = [1, 2, 3] as const;

function advance(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  const result = reduce(state, event);
  if (!result.ok) throw new Error(`unexpected ${result.error} for ${event.type}`);
  return result.state;
}

function readyForQuiz(): OnboardingState {
  let state = initialState(T);
  state = advance(state, { type: 'START', at: T + 1 });
  state = advance(state, { type: 'CHOOSE_WALLET_MODE', mode: 'create', at: T + 2 });
  return advance(state, { type: 'WALLET_READY', wordCount: 12, at: T + 3 });
}

function wrongAttempt(state: OnboardingState): OnboardingState {
  const withPositions = advance(state, { type: 'QUIZ_POSITIONS', positions, at: T + 4 });
  return advance(withPositions, { type: 'QUIZ_SUBMITTED', correct: [false, true, true], at: T + 5 });
}

describe('onboarding phrase-review acknowledgment gate', () => {
  it('rejects unsolicited PHRASE_REVIEWED before any failed quiz', () => {
    const state = readyForQuiz();
    const result = reduce(state, { type: 'PHRASE_REVIEWED', at: T + 4 });
    expect(result).toEqual({ ok: false, error: 'invalid_event', state });
    expect(result.state).toBe(state);
  });

  it('does not reset wrong-attempt count before mandatory phrase review', () => {
    let state = readyForQuiz();
    for (let attempt = 1; attempt < MAX_QUIZ_ATTEMPTS; attempt++) {
      state = wrongAttempt(state);
      expect(state.quizAttempts).toBe(attempt);
      const result = reduce(state, { type: 'PHRASE_REVIEWED', at: T + 6 });
      expect(result).toEqual({ ok: false, error: 'invalid_event', state });
      expect(result.state).toBe(state);
    }
    state = wrongAttempt(state);
    expect(state.reviewRequired).toBe(true);
    expect(state.quizAttempts).toBe(0);
  });

  it('accepts PHRASE_REVIEWED after three failures and allows a fresh quiz', () => {
    let state = readyForQuiz();
    for (let i = 0; i < MAX_QUIZ_ATTEMPTS; i++) state = wrongAttempt(state);
    expect(state.reviewRequired).toBe(true);
    expect(reduce(state, { type: 'QUIZ_POSITIONS', positions, at: T + 7 })).toMatchObject({
      ok: false,
      error: 'review_required',
    });
    state = advance(state, { type: 'PHRASE_REVIEWED', at: T + 8 });
    expect(state.reviewRequired).toBe(false);
    expect(state.quizAttempts).toBe(0);
    state = advance(state, { type: 'QUIZ_POSITIONS', positions, at: T + 9 });
    state = advance(state, { type: 'QUIZ_SUBMITTED', correct: [true, true, true], at: T + 10 });
    expect(state.step).toBe('profile');
    expect(state.backupConfirmed).toBe(true);
  });
});
