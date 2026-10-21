import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  AnswerError,
  PROFILE_IDS,
  QUESTIONS,
  TRADEOFFS,
  detectProfile,
  diffSettings,
  isProfileId,
  recommendProfile,
  settingsFor,
  type ProfileId,
} from './profiles.js';

describe('settingsFor', () => {
  it('returns exact plain data per profile', () => {
    expect(settingsFor('everyday')).toEqual({
      receiveAddressMode: 'reuse',
      sendDelayMaxMinutes: 0,
      fiatRateMode: 'on_demand',
      hideBalanceByDefault: false,
      addressReview: 'new_recipients',
      confirmationsRequired: 1,
      highValueFiatThreshold: 1000,
      autoLockMinutes: 15,
    });
    expect(settingsFor('maximum').sendDelayMaxMinutes).toBe(60);
    expect(settingsFor('maximum').fiatRateMode).toBe('off');
  });
  it('returns copies', () => {
    const a = settingsFor('private') as { autoLockMinutes: number };
    a.autoLockMinutes = 999;
    expect(settingsFor('private').autoLockMinutes).toBe(5);
  });
  it('throws on unknown id', () => {
    expect(() => settingsFor('__proto__' as ProfileId)).toThrow(RangeError);
  });
  it('privacy-related settings tighten monotonically', () => {
    const [a, b, c] = PROFILE_IDS.map(settingsFor) as [
      ReturnType<typeof settingsFor>,
      ReturnType<typeof settingsFor>,
      ReturnType<typeof settingsFor>,
    ];
    expect(a.confirmationsRequired).toBeLessThan(b.confirmationsRequired);
    expect(b.confirmationsRequired).toBeLessThan(c.confirmationsRequired);
    expect(a.highValueFiatThreshold).toBeGreaterThan(b.highValueFiatThreshold);
    expect(b.highValueFiatThreshold).toBeGreaterThan(c.highValueFiatThreshold);
    expect(a.autoLockMinutes).toBeGreaterThan(c.autoLockMinutes);
  });
});

describe('diff/detect', () => {
  it('diffs everyday to private', () => {
    const d = diffSettings(settingsFor('everyday'), settingsFor('private'));
    expect(d.map((x) => x.key)).toEqual([
      'receiveAddressMode',
      'sendDelayMaxMinutes',
      'fiatRateMode',
      'hideBalanceByDefault',
      'addressReview',
      'confirmationsRequired',
      'highValueFiatThreshold',
      'autoLockMinutes',
    ]);
    expect(d[1]).toEqual({ key: 'sendDelayMaxMinutes', from: 0, to: 10 });
  });
  it('same settings yield empty diff and detect profile', () => {
    expect(diffSettings(settingsFor('private'), settingsFor('private'))).toEqual([]);
    for (const p of PROFILE_IDS) expect(detectProfile(settingsFor(p))).toBe(p);
  });
  it('custom when tweaked', () => {
    expect(detectProfile({ ...settingsFor('private'), autoLockMinutes: 7 })).toBe('custom');
  });
  it('isProfileId', () => {
    expect(isProfileId('private')).toBe(true);
    expect(isProfileId('Private')).toBe(false);
    expect(isProfileId(3)).toBe(false);
  });
});

describe('tradeoffs table', () => {
  it('privacy strictly increases, speed and convenience strictly decrease', () => {
    const row = (id: string) => TRADEOFFS.find((r) => r.id === id)!;
    const lv = (id: string) => PROFILE_IDS.map((p) => row(id).cells[p].level);
    expect(lv('privacy')).toEqual([1, 2, 3]);
    expect(lv('speed')).toEqual([3, 2, 1]);
    expect(lv('convenience')).toEqual([3, 2, 1]);
    expect(lv('fees')).toEqual([3, 2, 2]);
  });
  it('has i18n keys for every cell', () => {
    for (const r of TRADEOFFS) {
      expect(r.labelKey).toMatch(/^guide\.profile\.tradeoff\./);
      for (const p of PROFILE_IDS) expect(r.cells[p].noteKey).toBe(`guide.profile.tradeoff.${r.id}.${p}`);
    }
  });
});

describe('recommendProfile', () => {
  it('defaults to private with no answers', () => {
    const r = recommendProfile({});
    expect(r.profile).toBe('private');
    expect(r.complete).toBe(false);
    expect(r.reasonKeys).toEqual([]);
  });
  it('casual/small/instant -> everyday with exact scores', () => {
    const r = recommendProfile({ audience: 'casual', amounts: 'small', waiting: 'instant' });
    expect(r.scores).toEqual({ everyday: 8, private: 3, maximum: 0 });
    expect(r.profile).toBe('everyday');
    expect(r.complete).toBe(true);
  });
  it('adversary/large/hours -> maximum', () => {
    const r = recommendProfile({ audience: 'adversary', amounts: 'large', waiting: 'hours' });
    expect(r.scores).toEqual({ everyday: 0, private: 3, maximum: 9 });
    expect(r.profile).toBe('maximum');
  });
  it('acquaintances/moderate/minutes -> private', () => {
    expect(
      recommendProfile({ audience: 'acquaintances', amounts: 'moderate', waiting: 'minutes' }).profile,
    ).toBe('private');
  });
  it('caps maximum to private when instant sends are needed', () => {
    const r = recommendProfile({ audience: 'adversary', amounts: 'large', waiting: 'instant' });
    expect(r.scores.maximum).toBe(6);
    expect(r.profile).toBe('private');
    expect(r.reasonKeys).toContain('guide.profile.reason.cap.instant');
  });
  it('ties break toward more private', () => {
    // casual: e3 p1 ; moderate: p2 m1 -> e3 p3 m1 : tie e/p -> private
    expect(recommendProfile({ audience: 'casual', amounts: 'moderate' }).profile).toBe('private');
  });
  it('rejects adversarial input', () => {
    expect(() => recommendProfile(null)).toThrow(AnswerError);
    expect(() => recommendProfile([])).toThrow(AnswerError);
    expect(() => recommendProfile('x')).toThrow(AnswerError);
    expect(() => recommendProfile({ audience: 'toString' })).toThrow(AnswerError);
    expect(() => recommendProfile({ audience: 5 })).toThrow(AnswerError);
    expect(() => recommendProfile({ audience: 'nope' })).toThrow(AnswerError);
    expect(() => recommendProfile({ bogus: 'casual' })).toThrow(AnswerError);
    expect(() => recommendProfile({ constructor: 'x' })).toThrow(AnswerError);
  });
  it('property: any valid answer set yields a valid profile; instant never maximum', () => {
    const opt = <Q extends keyof typeof QUESTIONS>(q: Q) => fc.constantFrom(...QUESTIONS[q]);
    fc.assert(
      fc.property(
        fc.record(
          { audience: opt('audience'), amounts: opt('amounts'), waiting: opt('waiting') },
          { requiredKeys: [] },
        ),
        (a) => {
          const r = recommendProfile(a);
          expect(PROFILE_IDS).toContain(r.profile);
          if (a.waiting === 'instant') expect(r.profile).not.toBe('maximum');
        },
      ),
    );
  });
});
